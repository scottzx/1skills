"""Sidecar identity for skill packages (Issue #379).

A stable ``id`` (plus fork lineage + the store version a copy was taken from)
lives in ``<package>/.skillmeta.json`` next to SKILL.md. Tracking by this id —
not the human-readable directory name — is what lets rename / fork lineage
survive.

The sidecar is intentionally excluded from the content fingerprint (see
``package.fingerprint_package``), exactly like ``.DS_Store``: editing baseVersion
or forking must never register as a content change, or every copy would read as
"modified". Claude Code only reads SKILL.md and ignores this file.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import secrets
from pathlib import Path

from skill_manager.atomic_files import atomic_write_text

SKILLMETA_FILENAME = ".skillmeta.json"


def new_skill_id() -> str:
    return "skl_" + secrets.token_hex(8)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass(frozen=True)
class SkillMeta:
    id: str
    # For a store package: its current version. For a workspace copy: the store
    # version it was taken from — the discriminator for concurrent-edit detection.
    base_version: int = 1
    forked_from: str | None = None
    forked_from_version: int | None = None
    created_at: str | None = None

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {"id": self.id, "baseVersion": self.base_version}
        if self.forked_from is not None:
            payload["forkedFrom"] = self.forked_from
        if self.forked_from_version is not None:
            payload["forkedFromVersion"] = self.forked_from_version
        payload["createdAt"] = self.created_at or utc_now_iso()
        return payload


def read_skill_meta(package_dir: Path) -> SkillMeta | None:
    path = package_dir / SKILLMETA_FILENAME
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    skill_id = payload.get("id")
    if not isinstance(skill_id, str) or not skill_id:
        return None
    return SkillMeta(
        id=skill_id,
        base_version=payload["baseVersion"] if isinstance(payload.get("baseVersion"), int) else 1,
        forked_from=payload.get("forkedFrom") if isinstance(payload.get("forkedFrom"), str) else None,
        forked_from_version=(
            payload["forkedFromVersion"] if isinstance(payload.get("forkedFromVersion"), int) else None
        ),
        created_at=payload.get("createdAt") if isinstance(payload.get("createdAt"), str) else None,
    )


def write_skill_meta(package_dir: Path, meta: SkillMeta) -> None:
    atomic_write_text(
        package_dir / SKILLMETA_FILENAME,
        json.dumps(meta.to_dict(), ensure_ascii=False, indent=2) + "\n",
    )


__all__ = [
    "SKILLMETA_FILENAME",
    "SkillMeta",
    "new_skill_id",
    "read_skill_meta",
    "utc_now_iso",
    "write_skill_meta",
]
