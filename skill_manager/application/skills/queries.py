from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from skill_manager.errors import MutationError
from skill_manager.sources import github_folder_url, github_repo_from_locator, github_repo_url

from .diffs import diff_packages
from .document_utils import read_skill_document_markdown
from .identity import SourceDescriptor
from .inventory import InventoryEntry, SkillInventory
from .package import SkillParseError, fingerprint_package, parse_skill_package
from .pending_conflicts import PendingConflictStore
from .policy import can_stop_managing, can_update, has_local_changes
from .presenters import skill_detail_payload, skills_page_payload, source_status_payload
from .read_models import SkillsReadModelService
from .skillmeta import read_skill_meta
from .source_fetch import SourceFetchService


class SkillsQueryService:
    def __init__(
        self,
        read_models: SkillsReadModelService,
        source_fetcher: SourceFetchService,
        pending_conflicts: PendingConflictStore,
    ) -> None:
        self.read_models = read_models
        self.source_fetcher = source_fetcher
        self.pending_conflicts = pending_conflicts

    def health(self) -> dict[str, object]:
        # Cheap liveness probe: do not rebuild the skills inventory snapshot.
        # Full scans fingerprint every shared package and can take many seconds
        # when packages contain large toolchains (e.g. local .venv trees).
        return {
            "ok": True,
            "app": "skill-manager",
            "readOnly": False,
            "harnessCount": len(self.read_models.adapters),
        }

    def list_skills(self) -> dict[str, object]:
        return skills_page_payload(self.inventory())

    def get_skill_detail(self, skill_ref: str) -> dict[str, object] | None:
        inventory = self.inventory()
        entry = inventory.find(skill_ref)
        if entry is None:
            return None
        package_root = self.resolve_detail_package_root(entry)
        return skill_detail_payload(
            entry,
            columns=inventory.columns,
            document_markdown=read_skill_document_markdown(package_root),
            source_links=self.build_source_links(entry),
        )

    def get_skill_source_status(self, skill_ref: str) -> dict[str, object] | None:
        entry = self.inventory().find(skill_ref)
        if entry is None:
            return None
        return source_status_payload(self.resolve_update_status(entry))

    def skill_status_from_path(self, skill_ref: str, source_path: str) -> dict[str, object]:
        """Read-only status of a workspace's own skill copy at source_path, keyed
        by its package dir (from skill_ref). Powers the assistant detail page:

        - inStore=False → a custom / local-only skill the user dropped into the
          workspace; it isn't in the shared store (母体) yet, so a push would
          *create* it (differs=True by convention — there's something to push).
        - inStore=True, differs=True/False → a store-backed skill, modified or
          in-sync with its baseline.

        name/description are parsed from the workspace copy's SKILL.md frontmatter
        so the card can show structured data, not just the folder name. Reported
        without require_entry so custom skills (absent from the inventory) are
        handled instead of 404'ing."""
        package_dir = Path(skill_ref.rsplit(":", 1)[-1]).name
        src = Path(source_path)
        src_exists = src.is_dir() and (src / "SKILL.md").is_file()
        name, description = package_dir, ""
        if src_exists:
            try:
                pkg = parse_skill_package(
                    src,
                    default_source=SourceDescriptor(kind="workspace", locator=f"workspace:{package_dir}"),
                )
                name = pkg.declared_name or package_dir
                description = pkg.description
            except SkillParseError:
                pass
        store = self.read_models.store
        meta = read_skill_meta(src) if src_exists else None
        # Prefer the stable-id sidecar (#379); a renamed copy still resolves to
        # its store package. Fall back to the dir-name key for legacy copies.
        entry = store.entry_for_id(meta.id) if meta is not None else None
        if entry is not None:
            package_dir = entry.package_dir
        store_dir = store.root / package_dir
        in_store = store_dir.is_dir() and (store_dir / "SKILL.md").is_file()
        differs = True
        if in_store and src_exists:
            differs = store.differs_from(package_dir, src)
        # baseMatches: is the workspace copy unchanged from the version it was taken
        # from (its base_version snapshot)? Distinguishes "clean but behind" (a
        # fast-forward pull is safe → update-available) from "locally edited". A
        # copy differs from the *current* store whenever the store advanced, so
        # `differs` alone can't tell those apart — this can.
        base_matches = False
        if entry is not None and meta is not None and store.history.has_version(entry.id, meta.base_version):
            snapshot = store.history.version_path(entry.id, meta.base_version)
            base_matches = fingerprint_package(src)[0] == fingerprint_package(snapshot)[0]
        return {
            "inStore": in_store,
            "differs": differs,
            "exists": src_exists,
            "name": name,
            "description": description,
            "storeVersion": store.version_of(package_dir) if in_store else None,
            "skillId": (entry.id if entry is not None else (meta.id if meta is not None else None)),
            "baseVersion": meta.base_version if meta is not None else None,
            "baseMatches": base_matches,
            "primaryTag": meta.primary_tag if meta is not None else None,
            "secondaryTag": meta.secondary_tag if meta is not None else None,
        }

    def list_skill_versions(self, skill_id: str) -> dict[str, object] | None:
        store = self.read_models.store
        entry = store.entry_for_id(skill_id)
        if entry is None:
            return None
        return {
            "id": skill_id,
            "name": entry.declared_name,
            "currentVersion": entry.version,
            "versions": store.history.versions(skill_id),
        }

    def get_skill_lineage(self, skill_id: str) -> dict[str, object] | None:
        return self.read_models.store.lineage(skill_id)

    def list_pending_conflicts(self) -> dict[str, object]:
        """Central inbox of project→母体 push submissions awaiting resolution.
        Each record carries a per-file diff (create: empty base vs staged;
        update/conflict: store base vs staged) plus the base's live store version
        when applicable."""
        store = self.read_models.store
        conflicts: list[dict[str, object]] = []
        for record in self.pending_conflicts.list():
            kind = getattr(record, "kind", "conflict") or "conflict"
            base = store.entry_for_id(record.base_id) if record.base_id else None
            staged = self.pending_conflicts.root / record.staged_dir
            diff: list[dict[str, object]] = []
            if staged.is_dir():
                if base is not None:
                    diff = diff_packages(
                        store.root / base.package_dir, staged, old_label="母体", new_label="推送"
                    )
                elif kind == "create":
                    # No base package — empty left side so every staged file is "added".
                    diff = diff_packages(
                        Path("/__skill_manager_empty__"), staged, old_label="母体", new_label="推送"
                    )
            conflicts.append(
                {
                    "conflictId": record.conflict_id,
                    "kind": kind,
                    "baseId": record.base_id or None,
                    "baseName": record.base_name,
                    "storeVersion": record.store_version,
                    "baseVersion": record.base_version,
                    "currentStoreVersion": base.version if base is not None else None,
                    "sourcePath": record.source_path,
                    "workspaceId": record.workspace_id,
                    "pushedRevision": record.pushed_revision,
                    "detectedAt": record.detected_at,
                    "diff": diff,
                }
            )
        conflicts.sort(key=lambda item: item["detectedAt"], reverse=True)
        return {"conflicts": conflicts}

    def preview_push_from_path(self, skill_ref: str, source_path: str) -> dict[str, object]:
        """What a push would change: the diff between a workspace copy and the
        current 母体, plus which package it targets and whether it diverged
        (#379). Read-only — powers the push preview dialog so the user sees the
        change and picks update-vs-fork with eyes open."""
        src = Path(source_path)
        if not (src.is_dir() and (src / "SKILL.md").is_file()):
            return {"exists": False, "target": None, "isNew": True, "files": []}
        store = self.read_models.store
        meta = read_skill_meta(src)
        entry = store.entry_for_id(meta.id) if meta is not None else None
        if entry is None:
            legacy_dir = Path(skill_ref.rsplit(":", 1)[-1]).name if skill_ref else ""
            entry = store.entry_for_dir(legacy_dir) if legacy_dir else None
        if entry is None:
            return {"exists": True, "target": None, "isNew": True, "files": []}
        files = diff_packages(
            store.root / entry.package_dir, src, old_label="母体", new_label="工作区"
        )
        diverged = (
            entry.version > meta.base_version if meta is not None and meta.base_version else bool(files)
        )
        return {
            "exists": True,
            "isNew": False,
            "sourcePath": str(src),
            "target": {
                "id": entry.id,
                "name": entry.declared_name,
                "storeVersion": entry.version,
                "baseVersion": meta.base_version if meta is not None else None,
            },
            "diverged": diverged,
            "files": files,
        }

    def diff_skill_versions(
        self, skill_id: str, from_version: int, to_version: int | None = None
    ) -> dict[str, object] | None:
        """Unified diff between two versions of a skill (``to_version`` defaults
        to the current live content) for the version-history compare view."""
        store = self.read_models.store
        entry = store.entry_for_id(skill_id)
        if entry is None:
            return None
        from_dir = store.history.version_path(skill_id, from_version)
        if not from_dir.is_dir():
            return None
        if to_version is None:
            to_dir = store.root / entry.package_dir
            to_label = "current"
        else:
            to_dir = store.history.version_path(skill_id, to_version)
            if not to_dir.is_dir():
                return None
            to_label = f"v{to_version}"
        files = diff_packages(from_dir, to_dir, old_label=f"v{from_version}", new_label=to_label)
        return {
            "id": skill_id,
            "from": from_version,
            "to": to_version if to_version is not None else entry.version,
            "toIsCurrent": to_version is None,
            "files": files,
        }

    def inventory(self) -> SkillInventory:
        snapshot = self.read_models.snapshot()
        return SkillInventory.from_snapshot(
            store_scan=snapshot.store_scan,
            harness_scans=self.read_models.visible_scans(snapshot),
        )

    def require_entry(self, skill_ref: str) -> InventoryEntry:
        entry = self.inventory().find(skill_ref)
        if entry is None:
            raise MutationError(f"unknown skill ref: {skill_ref}", status=404)
        return entry

    def check_for_update(self, entry: InventoryEntry) -> bool | None:
        if not can_update(entry) or entry.current_revision is None:
            return None
        with TemporaryDirectory(prefix="skill-check-") as work_dir:
            try:
                skill_path = self.source_fetcher.fetch(
                    source_kind=entry.source.kind,
                    source_locator=entry.source.locator,
                    work_dir=Path(work_dir),
                )
            except MutationError:
                return None
            fetched_revision, _ = fingerprint_package(skill_path)
            return fetched_revision != entry.current_revision

    def resolve_detail_package_root(self, entry: InventoryEntry) -> Path | None:
        if entry.package_path is not None and (entry.package_path / "SKILL.md").is_file():
            return entry.package_path

        for sighting in entry.detail_sightings():
            if sighting.path is not None and (sighting.path / "SKILL.md").is_file():
                return sighting.path
        return None

    def build_source_links(self, entry: InventoryEntry) -> dict[str, str | None] | None:
        if entry.source.kind != "github":
            return None

        repo = github_repo_from_locator(entry.source.locator)
        if repo is None:
            return None

        return {
            "repoLabel": repo,
            "repoUrl": github_repo_url(repo),
            "folderUrl": self._github_folder_url(entry, repo),
        }

    def _github_folder_url(self, entry: InventoryEntry, repo: str) -> str | None:
        if entry.source_ref is not None and entry.source_path is not None:
            return github_folder_url(repo, ref=entry.source_ref, relative_path=entry.source_path)
        if entry.source.locator.removeprefix("github:").count("/") < 2:
            return None
        with TemporaryDirectory(prefix="skill-source-links-") as work_dir:
            try:
                fetched = self.source_fetcher.fetch_package(
                    source_kind=entry.source.kind,
                    source_locator=entry.source.locator,
                    work_dir=Path(work_dir),
                )
            except MutationError:
                return None
        return github_folder_url(repo, ref=fetched.source_ref, relative_path=fetched.source_path)

    def resolve_update_status(
        self,
        entry: InventoryEntry,
    ) -> Literal["update_available", "no_update_available", "no_source_available", "local_changes_detected"] | None:
        if entry.kind != "managed":
            return None
        if has_local_changes(entry):
            return "local_changes_detected"
        if not can_update(entry):
            return "no_source_available"
        if self.check_for_update(entry):
            return "update_available"
        return "no_update_available"

    def can_stop_managing(self, entry: InventoryEntry) -> bool:
        return can_stop_managing(entry)

    def get_skill_path(self, skill_ref: str) -> Path | None:
        entry = self.inventory().find(skill_ref)
        if entry is None:
            return None
        return self.resolve_detail_package_root(entry)
