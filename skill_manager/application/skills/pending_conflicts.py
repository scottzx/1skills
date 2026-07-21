"""Central inbox of project→母体 push submissions awaiting resolution.

Project UIs only *push* (stage) skill content. Whether a push is adopted into
the shared store is decided later in Skills Manager:

- ``create`` — new skill not yet in the store
- ``update`` — linear content change against a known base
- ``conflict`` — concurrent edit (store advanced past the workspace baseVersion)

Snapshotting at push time means resolution never depends on the workspace copy
staying intact (it may be re-edited, moved, or deleted before the user acts).
"""

from __future__ import annotations

import json
import secrets
import shutil
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Literal

from skill_manager.atomic_files import atomic_write_text, file_lock

from .package import fingerprint_package

PendingKind = Literal["create", "update", "conflict"]

_FIELDS = {
    "conflict_id",
    "kind",
    "base_id",
    "base_name",
    "store_version",
    "base_version",
    "source_path",
    "workspace_id",
    "pushed_revision",
    "staged_dir",
    "detected_at",
}


@dataclass(frozen=True)
class PendingConflict:
    conflict_id: str
    kind: PendingKind
    base_id: str  # empty for kind=create
    base_name: str
    store_version: int
    base_version: int
    source_path: str
    workspace_id: str | None
    pushed_revision: str
    staged_dir: str  # "<conflict_id>/<pkgname>", relative to root
    detected_at: float


class PendingConflictStore:
    """File-locked JSON registry + staging dirs under ``root``. Mirrors the
    locking idiom of ``SkillStore`` (manifest.json + .lock sibling)."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.manifest_path = root / "pending_conflicts.json"

    @property
    def lock_path(self) -> Path:
        return self.manifest_path.with_suffix(".lock")

    def record(
        self,
        *,
        kind: PendingKind,
        base_id: str,
        base_name: str,
        store_version: int,
        base_version: int,
        source_path: str,
        workspace_id: str | None,
        source_package_path: Path,
    ) -> PendingConflict:
        """Snapshot the pushed package into staging and register a pending record.
        Identical re-pushes (same kind + base + content) refresh the existing
        record rather than stacking duplicates."""
        self.root.mkdir(parents=True, exist_ok=True)
        with file_lock(self.lock_path):
            pushed_revision, _ = fingerprint_package(source_package_path)
            entries = self._load()
            for existing in entries:
                if (
                    existing.kind == kind
                    and existing.base_id == base_id
                    and existing.pushed_revision == pushed_revision
                ):
                    refreshed = replace(
                        existing,
                        base_name=base_name,
                        store_version=store_version,
                        base_version=base_version,
                        source_path=str(source_path),
                        workspace_id=workspace_id,
                        detected_at=time.time(),
                    )
                    self._write(
                        [refreshed if e.conflict_id == existing.conflict_id else e for e in entries]
                    )
                    return refreshed
            conflict_id = secrets.token_hex(8)
            staged = self.root / conflict_id / source_package_path.name
            shutil.copytree(source_package_path, staged)
            record = PendingConflict(
                conflict_id=conflict_id,
                kind=kind,
                base_id=base_id,
                base_name=base_name,
                store_version=store_version,
                base_version=base_version,
                source_path=str(source_path),
                workspace_id=workspace_id,
                pushed_revision=pushed_revision,
                staged_dir=f"{conflict_id}/{source_package_path.name}",
                detected_at=time.time(),
            )
            self._write(entries + [record])
            return record

    def list(self) -> list[PendingConflict]:
        return self._load()

    def get(self, conflict_id: str) -> PendingConflict | None:
        return next((e for e in self._load() if e.conflict_id == conflict_id), None)

    def staged_path(self, conflict_id: str) -> Path:
        record = self.get(conflict_id)
        if record is None:
            raise ValueError(f"unknown conflict id: {conflict_id}")
        return self.root / record.staged_dir

    def remove(self, conflict_id: str) -> None:
        """Drop the record and its staged snapshot (used on both resolve and dismiss)."""
        with file_lock(self.lock_path):
            entries = self._load()
            staged_parent = self.root / conflict_id
            if staged_parent.exists():
                shutil.rmtree(staged_parent, ignore_errors=True)
            self._write([e for e in entries if e.conflict_id != conflict_id])

    # ---- helpers ---------------------------------------------------------

    def _load(self) -> list[PendingConflict]:
        if not self.manifest_path.is_file():
            return []
        try:
            payload = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        out: list[PendingConflict] = []
        for item in payload.get("entries", []):
            if not isinstance(item, dict):
                continue
            # Back-compat: older records lack kind → treat as conflict.
            if "kind" not in item:
                item = {**item, "kind": "conflict"}
            if not _FIELDS <= set(item):
                continue
            kind = item["kind"]
            if kind not in ("create", "update", "conflict"):
                kind = "conflict"
            out.append(
                PendingConflict(
                    conflict_id=str(item["conflict_id"]),
                    kind=kind,  # type: ignore[arg-type]
                    base_id=str(item["base_id"] or ""),
                    base_name=str(item["base_name"]),
                    store_version=int(item["store_version"]),
                    base_version=int(item["base_version"]),
                    source_path=str(item["source_path"]),
                    workspace_id=item["workspace_id"],
                    pushed_revision=str(item["pushed_revision"]),
                    staged_dir=str(item["staged_dir"]),
                    detected_at=float(item["detected_at"]),
                )
            )
        return out

    def _write(self, entries: list[PendingConflict]) -> None:
        atomic_write_text(
            self.manifest_path,
            json.dumps({"entries": [asdict(e) for e in entries]}, indent=2),
        )


__all__ = ["PendingConflict", "PendingConflictStore", "PendingKind"]
