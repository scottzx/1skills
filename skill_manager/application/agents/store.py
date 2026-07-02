"""Central store for subagent files.

The store root holds flat ``<name>.md`` files (contrast the skills store, which
holds ``<name>/`` directories). The manifest struct (``SkillStoreEntry``) is
reused from the skills family unchanged — ``package_dir`` here holds the
``<name>.md`` filename rather than a directory name.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from skill_manager.atomic_files import file_lock

from ..skills.health import CheckIssue
from ..skills.identity import SourceDescriptor
from ..skills.manifest import (
    SkillStoreEntry,
    SkillStoreManifest,
    load_skill_store_manifest,
    write_skill_store_manifest,
)
from .observations import AgentStoreScan, StoreAgentObservation
from .package import find_agent_files, fingerprint_agent, parse_agent_file


class AgentStore:
    def __init__(self, root: Path, manifest_path: Path | None = None) -> None:
        self.root = root
        self.manifest_path = manifest_path or root.parent / "agents-manifest.json"

    @property
    def lock_path(self) -> Path:
        return self.manifest_path.with_suffix(".lock")

    def scan(self) -> AgentStoreScan:
        manifest = load_skill_store_manifest(self.manifest_path)
        manifest_index = {entry.package_dir: entry for entry in manifest.entries}
        packages: list[StoreAgentObservation] = []
        for path in find_agent_files(self.root):
            entry = manifest_index.get(path.name)
            source = SourceDescriptor(
                kind=entry.source_kind if entry else "shared-store",
                locator=entry.source_locator if entry else f"shared-store:{path.name}",
            )
            packages.append(
                StoreAgentObservation(
                    package=parse_agent_file(path, default_source=source),
                    recorded_revision=entry.revision if entry else None,
                    recorded_source_ref=entry.source_ref if entry else None,
                    recorded_source_path=entry.source_path if entry else None,
                )
            )
        return AgentStoreScan(
            packages=tuple(packages),
            issues=tuple(issue.message for issue in self.check_integrity()),
        )

    def ingest(
        self,
        *,
        source_path: Path,
        declared_name: str,
        source_kind: str,
        source_locator: str,
        source_ref: str | None = None,
        source_path_hint: str | None = None,
    ) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        with file_lock(self.lock_path):
            dest = self.root / source_path.name
            if dest.exists():
                raise ValueError(f"agent file already exists in store: {source_path.name}")
            shutil.copy2(source_path, dest)
            manifest = load_skill_store_manifest(self.manifest_path)
            entry = SkillStoreEntry(
                package_dir=source_path.name,
                declared_name=declared_name,
                source_kind=source_kind,
                source_locator=source_locator,
                revision=fingerprint_agent(dest),
                source_ref=source_ref,
                source_path=source_path_hint,
            )
            write_skill_store_manifest(
                self.manifest_path,
                SkillStoreManifest(entries=manifest.entries + (entry,)),
            )
            return dest

    def update(
        self,
        package_dir: str,
        *,
        source_path: Path,
        source_ref: str | None = None,
        source_path_hint: str | None = None,
    ) -> tuple[Path, bool]:
        with file_lock(self.lock_path):
            dest = self.root / package_dir
            if not dest.is_file():
                raise ValueError(f"agent not in store: {package_dir}")
            new_fp = fingerprint_agent(source_path)
            old_fp = fingerprint_agent(dest)
            if new_fp == old_fp:
                return dest, False
            shutil.copy2(source_path, dest)
            manifest = load_skill_store_manifest(self.manifest_path)
            updated = tuple(
                SkillStoreEntry(
                    e.package_dir,
                    e.declared_name,
                    e.source_kind,
                    e.source_locator,
                    new_fp,
                    e.source_ref if source_ref is None else source_ref,
                    e.source_path if source_path_hint is None else source_path_hint,
                )
                if e.package_dir == package_dir
                else e
                for e in manifest.entries
            )
            write_skill_store_manifest(
                self.manifest_path,
                SkillStoreManifest(entries=updated),
            )
            return dest, True

    def differs_from(self, package_dir: str, source_path: Path) -> bool:
        """Read-only counterpart to update: True when source_path's content
        differs from the stored agent. Lights up a "push available" affordance
        without mutating the store."""
        dest = self.root / package_dir
        if not dest.is_file():
            raise ValueError(f"agent not in store: {package_dir}")
        return fingerprint_agent(source_path) != fingerprint_agent(dest)

    def delete(self, package_dir: str) -> None:
        with file_lock(self.lock_path):
            self.ensure_deletable(package_dir)
            dest = self.root / package_dir
            manifest = load_skill_store_manifest(self.manifest_path)
            dest.unlink()
            updated = tuple(entry for entry in manifest.entries if entry.package_dir != package_dir)
            write_skill_store_manifest(
                self.manifest_path,
                SkillStoreManifest(entries=updated),
            )

    def ensure_deletable(self, package_dir: str) -> None:
        dest = self.root / package_dir
        if not dest.is_file():
            raise ValueError(f"agent not in store: {package_dir}")
        manifest = load_skill_store_manifest(self.manifest_path)
        if not any(entry.package_dir == package_dir for entry in manifest.entries):
            raise ValueError(f"agent missing from manifest: {package_dir}")

    def check_integrity(self) -> tuple[CheckIssue, ...]:
        # A single .md file is self-describing; there is no analogue to the
        # skills "missing SKILL.md" integrity error, so nothing to check.
        return ()


__all__ = ["AgentStore"]
