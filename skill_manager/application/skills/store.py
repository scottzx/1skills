from __future__ import annotations

import re
import secrets
import shutil
from dataclasses import replace
from pathlib import Path

from skill_manager.atomic_files import file_lock

from .health import CheckIssue
from .history import SkillHistoryStore
from .identity import SourceDescriptor
from .manifest import (
    SkillStoreEntry,
    SkillStoreManifest,
    load_skill_store_manifest,
    write_skill_store_manifest,
)
from .observations import SkillStoreScan, StorePackageObservation
from .package import find_skill_roots, fingerprint_package, parse_skill_package
from .skillmeta import SkillMeta, new_skill_id, read_skill_meta, write_skill_meta


def slugify_dir(name: str) -> str:
    slug = re.sub(r"[^\w.-]+", "-", name.strip()).strip("-.")
    return slug or "skill"


class SkillStore:
    def __init__(
        self,
        root: Path,
        manifest_path: Path | None = None,
        history: SkillHistoryStore | None = None,
    ) -> None:
        self.root = root
        self.manifest_path = manifest_path or root.parent / "manifest.json"
        self.history = history or SkillHistoryStore(root.parent / "history")

    @property
    def lock_path(self) -> Path:
        return self.manifest_path.with_suffix(".lock")

    # ---- reads -----------------------------------------------------------

    def scan(self) -> SkillStoreScan:
        manifest = load_skill_store_manifest(self.manifest_path)
        manifest_index = {entry.package_dir: entry for entry in manifest.entries}
        packages: list[StorePackageObservation] = []
        for path in find_skill_roots(self.root):
            entry = manifest_index.get(path.name)
            source = SourceDescriptor(
                kind=entry.source_kind if entry else "shared-store",
                locator=entry.source_locator if entry else f"shared-store:{path.name}",
            )
            packages.append(
                StorePackageObservation(
                    package=parse_skill_package(path, default_source=source),
                    recorded_revision=entry.revision if entry else None,
                    recorded_source_ref=entry.source_ref if entry else None,
                    recorded_source_path=entry.source_path if entry else None,
                    recorded_id=entry.id if entry else None,
                    recorded_version=entry.version if entry else 1,
                    recorded_forked_from=entry.forked_from if entry else None,
                    recorded_forked_from_version=entry.forked_from_version if entry else None,
                    recorded_is_primary=entry.is_primary if entry else True,
                    recorded_primary_tag=entry.primary_tag if entry else None,
                    recorded_secondary_tag=entry.secondary_tag if entry else None,
                )
            )
        return SkillStoreScan(
            packages=tuple(packages),
            issues=tuple(issue.message for issue in self.check_integrity()),
        )

    def entries(self) -> tuple[SkillStoreEntry, ...]:
        return load_skill_store_manifest(self.manifest_path).entries

    def entry_for_dir(self, package_dir: str) -> SkillStoreEntry | None:
        return next((e for e in self.entries() if e.package_dir == package_dir), None)

    def entry_for_id(self, skill_id: str) -> SkillStoreEntry | None:
        return next((e for e in self.entries() if e.id == skill_id), None)

    def find_by_revision(self, revision: str) -> SkillStoreEntry | None:
        """First store package whose recorded content fingerprint equals
        ``revision``. Powers content-hash dedup for id-less pushes/imports."""
        return next((e for e in self.entries() if e.revision == revision), None)

    def version_of(self, package_dir: str) -> int | None:
        entry = self.entry_for_dir(package_dir)
        return entry.version if entry else None

    def differs_from(self, package_dir: str, source_path: Path) -> bool:
        dest = self.root / package_dir
        if not dest.is_dir():
            raise ValueError(f"package not in store: {package_dir}")
        new_fp, _ = fingerprint_package(source_path)
        old_fp, _ = fingerprint_package(dest)
        return new_fp != old_fp

    # ---- writes ----------------------------------------------------------

    def ingest(
        self,
        *,
        source_path: Path,
        declared_name: str,
        source_kind: str,
        source_locator: str,
        source_ref: str | None = None,
        source_path_hint: str | None = None,
        allow_duplicate_name: bool = False,
        desired_dir: str | None = None,
        skill_id: str | None = None,
        forked_from: str | None = None,
        forked_from_version: int | None = None,
        is_primary: bool = True,
        history_source: str = "import",
        note: str | None = None,
    ) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        with file_lock(self.lock_path):
            base = desired_dir or source_path.name
            if (self.root / base).exists():
                if not allow_duplicate_name:
                    raise ValueError(f"package directory already exists in store: {base}")
                base = self._unique_dir_name(base)
            dest = self.root / base
            shutil.copytree(source_path, dest)
            sid = skill_id or new_skill_id()
            fingerprint, _ = fingerprint_package(dest)
            source_meta = read_skill_meta(source_path)
            ptag = source_meta.primary_tag if source_meta else None
            stag = source_meta.secondary_tag if source_meta else None
            # authoritative sidecar (overwrites any copy carried in from source)
            write_skill_meta(
                dest,
                SkillMeta(
                    id=sid,
                    base_version=1,
                    forked_from=forked_from,
                    forked_from_version=forked_from_version,
                    primary_tag=ptag,
                    secondary_tag=stag,
                ),
            )
            entry = SkillStoreEntry(
                package_dir=base,
                declared_name=declared_name,
                source_kind=source_kind,
                source_locator=source_locator,
                revision=fingerprint,
                source_ref=source_ref,
                source_path=source_path_hint,
                version=1,
                id=sid,
                forked_from=forked_from,
                forked_from_version=forked_from_version,
                is_primary=is_primary,
                primary_tag=ptag,
                secondary_tag=stag,
            )
            manifest = load_skill_store_manifest(self.manifest_path)
            write_skill_store_manifest(
                self.manifest_path,
                SkillStoreManifest(entries=manifest.entries + (entry,)),
            )
            self.history.snapshot(sid, 1, dest, revision=fingerprint, source=history_source, note=note)
            return dest

    def update(
        self,
        package_dir: str,
        *,
        source_path: Path,
        source_ref: str | None = None,
        source_path_hint: str | None = None,
        history_source: str = "push",
        note: str | None = None,
    ) -> tuple[Path, bool]:
        with file_lock(self.lock_path):
            dest = self.root / package_dir
            if not dest.is_dir():
                raise ValueError(f"package not in store: {package_dir}")
            new_fp, _ = fingerprint_package(source_path)
            old_fp, _ = fingerprint_package(dest)
            if new_fp == old_fp:
                return dest, False
            manifest = load_skill_store_manifest(self.manifest_path)
            old_entry = next((e for e in manifest.entries if e.package_dir == package_dir), None)
            sid = old_entry.id if old_entry and old_entry.id else new_skill_id()
            new_version = (old_entry.version if old_entry else 1) + 1
            created_at = self._preserve_created_at(dest)
            shutil.rmtree(dest)
            shutil.copytree(source_path, dest)
            source_meta = read_skill_meta(source_path)
            ptag = source_meta.primary_tag if (source_meta and source_meta.primary_tag) else (old_entry.primary_tag if old_entry else None)
            stag = source_meta.secondary_tag if (source_meta and source_meta.secondary_tag) else (old_entry.secondary_tag if old_entry else None)
            write_skill_meta(
                dest,
                SkillMeta(
                    id=sid,
                    base_version=new_version,
                    forked_from=old_entry.forked_from if old_entry else None,
                    forked_from_version=old_entry.forked_from_version if old_entry else None,
                    created_at=created_at,
                    primary_tag=ptag,
                    secondary_tag=stag,
                ),
            )
            updated = tuple(
                replace(
                    e,
                    revision=new_fp,
                    source_ref=e.source_ref if source_ref is None else source_ref,
                    source_path=e.source_path if source_path_hint is None else source_path_hint,
                    version=new_version,
                    id=sid,
                    primary_tag=ptag,
                    secondary_tag=stag,
                )
                if e.package_dir == package_dir
                else e
                for e in manifest.entries
            )
            write_skill_store_manifest(self.manifest_path, SkillStoreManifest(entries=updated))
            self.history.snapshot(sid, new_version, dest, revision=new_fp, source=history_source, note=note)
            return dest, True

    def restore(self, skill_id: str, version: int) -> int:
        """Non-destructive restore: re-materialize ``version`` as a *new*
        version on top of history. Returns the new version number."""
        with file_lock(self.lock_path):
            entry = self.entry_for_id(skill_id)
            if entry is None:
                raise ValueError(f"skill id not in store: {skill_id}")
            snapshot = self.history.version_path(skill_id, version)
            if not snapshot.is_dir():
                raise ValueError(f"version not in history: v{version}")
            dest = self.root / entry.package_dir
            new_version = entry.version + 1
            created_at = self._preserve_created_at(dest)
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(snapshot, dest)
            new_fp, _ = fingerprint_package(dest)
            write_skill_meta(
                dest,
                SkillMeta(
                    id=skill_id,
                    base_version=new_version,
                    forked_from=entry.forked_from,
                    forked_from_version=entry.forked_from_version,
                    created_at=created_at,
                ),
            )
            manifest = load_skill_store_manifest(self.manifest_path)
            updated = tuple(
                replace(e, revision=new_fp, version=new_version) if e.id == skill_id else e
                for e in manifest.entries
            )
            write_skill_store_manifest(self.manifest_path, SkillStoreManifest(entries=updated))
            self.history.snapshot(
                skill_id, new_version, dest, revision=new_fp, source="restore", note=f"restored from v{version}"
            )
            return new_version

    def pull_to_path(self, package_dir: str, target_path: Path) -> int:
        """Materialize the store package's current content into ``target_path``
        (母体 → 项目 fast-forward). The store package already carries its
        authoritative `.skillmeta.json` (id + base_version = current version +
        tags), so a plain copytree lands the correct sidecar in the workspace.
        The caller is responsible for the clean/fast-forward safety check."""
        with file_lock(self.lock_path):
            dest = self.root / package_dir
            if not dest.is_dir():
                raise ValueError(f"package not in store: {package_dir}")
            entry = next((e for e in self.entries() if e.package_dir == package_dir), None)
            if target_path.exists():
                shutil.rmtree(target_path)
            shutil.copytree(dest, target_path)
            return entry.version if entry else 1

    def set_primary(self, skill_id: str) -> None:
        """Make ``skill_id`` the primary (main) of its fork lineage, demoting
        every other package in the same connected component."""
        with file_lock(self.lock_path):
            manifest = load_skill_store_manifest(self.manifest_path)
            if not any(e.id == skill_id for e in manifest.entries):
                raise ValueError(f"skill id not in store: {skill_id}")
            component = self._lineage_component(skill_id, manifest.entries)
            updated = tuple(
                replace(e, is_primary=(e.id == skill_id)) if e.id in component else e
                for e in manifest.entries
            )
            write_skill_store_manifest(self.manifest_path, SkillStoreManifest(entries=updated))

    def lineage(self, skill_id: str) -> dict[str, object] | None:
        entries = self.entries()
        by_id = {e.id: e for e in entries if e.id}
        if skill_id not in by_id:
            return None
        component = self._lineage_component(skill_id, entries)
        primary = next((cid for cid in component if by_id[cid].is_primary), None)
        branches = [
            {
                "id": e.id,
                "name": e.declared_name,
                "packageDir": e.package_dir,
                "version": e.version,
                "forkedFrom": e.forked_from,
                "forkedFromVersion": e.forked_from_version,
                "isPrimary": e.is_primary,
            }
            for e in (by_id[cid] for cid in component)
        ]
        branches.sort(key=lambda item: (not item["isPrimary"], str(item["name"])))
        return {
            "id": skill_id,
            "primaryId": primary,
            "branches": branches,
        }

    # ---- migration -------------------------------------------------------

    def migrate_ids_and_history(self) -> None:
        """One-time, idempotent: give every legacy manifest entry a stable id +
        sidecar, and snapshot its current content as its current version so the
        history drawer has a baseline. No-ops once every entry is migrated."""
        if not self.manifest_path.is_file():
            return
        with file_lock(self.lock_path):
            manifest = load_skill_store_manifest(self.manifest_path)
            changed = False
            migrated: list[SkillStoreEntry] = []
            for entry in manifest.entries:
                dest = self.root / entry.package_dir
                if not (dest / "SKILL.md").is_file():
                    migrated.append(entry)
                    continue
                sid = entry.id
                if not sid:
                    existing = read_skill_meta(dest)
                    sid = existing.id if existing else new_skill_id()
                    entry = replace(entry, id=sid)
                    changed = True
                if read_skill_meta(dest) is None or read_skill_meta(dest).id != sid:  # type: ignore[union-attr]
                    write_skill_meta(
                        dest,
                        SkillMeta(
                            id=sid,
                            base_version=entry.version,
                            forked_from=entry.forked_from,
                            forked_from_version=entry.forked_from_version,
                        ),
                    )
                if not self.history.has_version(sid, entry.version):
                    revision, _ = fingerprint_package(dest)
                    self.history.snapshot(
                        sid, entry.version, dest, revision=revision, source="migrate"
                    )
                migrated.append(entry)
            if changed:
                write_skill_store_manifest(self.manifest_path, SkillStoreManifest(entries=tuple(migrated)))

    # ---- delete / integrity (unchanged behavior) -------------------------

    def delete(self, package_dir: str) -> None:
        with file_lock(self.lock_path):
            self.ensure_deletable(package_dir)
            dest = self.root / package_dir
            manifest = load_skill_store_manifest(self.manifest_path)
            shutil.rmtree(dest)
            updated = tuple(entry for entry in manifest.entries if entry.package_dir != package_dir)
            write_skill_store_manifest(self.manifest_path, SkillStoreManifest(entries=updated))

    def ensure_deletable(self, package_dir: str) -> None:
        dest = self.root / package_dir
        if not dest.is_dir():
            raise ValueError(f"package not in store: {package_dir}")
        manifest = load_skill_store_manifest(self.manifest_path)
        if not any(entry.package_dir == package_dir for entry in manifest.entries):
            raise ValueError(f"package missing from manifest: {package_dir}")

    def check_integrity(self) -> tuple[CheckIssue, ...]:
        issues: list[CheckIssue] = []
        if not self.root.exists():
            return ()
        for path in sorted(self.root.iterdir()):
            if path.is_dir() and not (path / "SKILL.md").is_file():
                issues.append(
                    CheckIssue(
                        severity="error",
                        code="shared-missing-skill-md",
                        message=f"Shared package is missing SKILL.md: {path.name}",
                    )
                )
        return tuple(issues)

    # ---- helpers ---------------------------------------------------------

    def _preserve_created_at(self, dest: Path) -> str | None:
        existing = read_skill_meta(dest)
        return existing.created_at if existing else None

    def _unique_dir_name(self, base: str) -> str:
        candidate = base
        while (self.root / candidate).exists():
            candidate = f"{base}-{secrets.token_hex(3)}"
        return candidate

    def _lineage_component(self, skill_id: str, entries: tuple[SkillStoreEntry, ...]) -> set[str]:
        by_id = {e.id: e for e in entries if e.id}

        def root_of(cid: str) -> str:
            seen: set[str] = set()
            while True:
                entry = by_id.get(cid)
                if entry is None or entry.forked_from is None or entry.forked_from not in by_id:
                    return cid
                if cid in seen:
                    return cid
                seen.add(cid)
                cid = entry.forked_from

        target_root = root_of(skill_id)
        return {cid for cid in by_id if root_of(cid) == target_root}


__all__ = ["SkillStore", "slugify_dir"]
