from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from skill_manager.errors import MutationError
from skill_manager.sources import github_folder_url, github_repo_from_locator, github_repo_url

from .document_utils import read_skill_document_markdown
from .identity import SourceDescriptor
from .inventory import InventoryEntry, SkillInventory
from .package import SkillParseError, fingerprint_package, parse_skill_package
from .policy import can_stop_managing, can_update, has_local_changes
from .presenters import skill_detail_payload, skills_page_payload, source_status_payload
from .read_models import SkillsReadModelService
from .source_fetch import SourceFetchService


class SkillsQueryService:
    def __init__(
        self,
        read_models: SkillsReadModelService,
        source_fetcher: SourceFetchService,
    ) -> None:
        self.read_models = read_models
        self.source_fetcher = source_fetcher

    def health(self) -> dict[str, object]:
        snapshot = self.read_models.snapshot()
        return {
            "ok": True,
            "app": "skill-manager",
            "readOnly": False,
            "harnessCount": len(snapshot.harness_scans),
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
        store_dir = store.root / package_dir
        in_store = store_dir.is_dir() and (store_dir / "SKILL.md").is_file()
        differs = True
        if in_store and src_exists:
            differs = store.differs_from(package_dir, src)
        return {
            "inStore": in_store,
            "differs": differs,
            "exists": src_exists,
            "name": name,
            "description": description,
            "storeVersion": store.version_of(package_dir) if in_store else None,
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
