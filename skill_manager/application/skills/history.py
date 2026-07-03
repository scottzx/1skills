"""Whole-package version history for the skill store (Issue #379).

Every content-changing push lands a full copy of the package under
``history/<id>/v<N>/`` plus an ``index.json`` line recording ``{version,
revision, createdAt, source, note}``. History is append-only — restore writes a
*new* version, it never rewrites an old one — so nothing is ever lost. Packages
are small; whole-package copies keep the model dead simple.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from skill_manager.atomic_files import atomic_write_text, file_lock

from .skillmeta import utc_now_iso


class SkillHistoryStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def package_root(self, skill_id: str) -> Path:
        return self.root / skill_id

    def _index_path(self, skill_id: str) -> Path:
        return self.package_root(skill_id) / "index.json"

    def _lock_path(self, skill_id: str) -> Path:
        return self.package_root(skill_id) / ".history.lock"

    def version_path(self, skill_id: str, version: int) -> Path:
        return self.package_root(skill_id) / f"v{version}"

    def has_version(self, skill_id: str, version: int) -> bool:
        return self.version_path(skill_id, version).is_dir()

    def versions(self, skill_id: str) -> list[dict[str, object]]:
        path = self._index_path(skill_id)
        if not path.is_file():
            return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError, ValueError):
            return []
        if not isinstance(payload, dict):
            return []
        entries = payload.get("versions")
        return list(entries) if isinstance(entries, list) else []

    def snapshot(
        self,
        skill_id: str,
        version: int,
        content_dir: Path,
        *,
        revision: str,
        source: str,
        note: str | None = None,
    ) -> None:
        """Copy ``content_dir`` to ``history/<id>/v<version>`` and index it.

        Idempotent per (id, version): a re-snapshot of an existing version is a
        no-op, so migration / retried pushes are safe."""
        self.package_root(skill_id).mkdir(parents=True, exist_ok=True)
        with file_lock(self._lock_path(skill_id)):
            vpath = self.version_path(skill_id, version)
            if not vpath.exists():
                shutil.copytree(content_dir, vpath)
            index = self.versions(skill_id)
            if not any(isinstance(item, dict) and item.get("version") == version for item in index):
                record: dict[str, object] = {
                    "version": version,
                    "revision": revision,
                    "createdAt": utc_now_iso(),
                    "source": source,
                }
                if note:
                    record["note"] = note
                index.append(record)
                index.sort(key=lambda item: item.get("version", 0) if isinstance(item, dict) else 0)
                atomic_write_text(
                    self._index_path(skill_id),
                    json.dumps({"versions": index}, ensure_ascii=False, indent=2) + "\n",
                )


__all__ = ["SkillHistoryStore"]
