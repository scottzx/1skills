from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from skill_manager.atomic_files import atomic_write_text


@dataclass(frozen=True)
class SkillStoreEntry:
    package_dir: str
    declared_name: str
    source_kind: str
    source_locator: str
    revision: str
    source_ref: str | None = None
    source_path: str | None = None
    version: int = 1
    # Stable identity + fork lineage (#379). id is None only for legacy entries
    # before the one-time migration assigns one. is_primary marks the main branch
    # within a fork lineage (exactly one True per connected component).
    id: str | None = None
    forked_from: str | None = None
    forked_from_version: int | None = None
    is_primary: bool = True

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "packageDir": self.package_dir,
            "declaredName": self.declared_name,
            "sourceKind": self.source_kind,
            "sourceLocator": self.source_locator,
            "revision": self.revision,
            "version": self.version,
        }
        if self.source_ref is not None:
            payload["sourceRef"] = self.source_ref
        if self.source_path is not None:
            payload["sourcePath"] = self.source_path
        if self.id is not None:
            payload["id"] = self.id
        if self.forked_from is not None:
            payload["forkedFrom"] = self.forked_from
        if self.forked_from_version is not None:
            payload["forkedFromVersion"] = self.forked_from_version
        payload["isPrimary"] = self.is_primary
        return payload


@dataclass(frozen=True)
class SkillStoreManifest:
    entries: tuple[SkillStoreEntry, ...]

    def to_dict(self) -> dict[str, object]:
        return {"entries": [entry.to_dict() for entry in self.entries]}


def load_skill_store_manifest(path: Path) -> SkillStoreManifest:
    if not path.is_file():
        return SkillStoreManifest(entries=())
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = tuple(
        SkillStoreEntry(
            package_dir=item["packageDir"],
            declared_name=item["declaredName"],
            source_kind=item["sourceKind"],
            source_locator=item["sourceLocator"],
            revision=item["revision"],
            source_ref=item.get("sourceRef") if isinstance(item.get("sourceRef"), str) else None,
            source_path=item.get("sourcePath") if isinstance(item.get("sourcePath"), str) else None,
            version=item["version"] if isinstance(item.get("version"), int) else 1,
            id=item.get("id") if isinstance(item.get("id"), str) else None,
            forked_from=item.get("forkedFrom") if isinstance(item.get("forkedFrom"), str) else None,
            forked_from_version=(
                item["forkedFromVersion"] if isinstance(item.get("forkedFromVersion"), int) else None
            ),
            is_primary=item["isPrimary"] if isinstance(item.get("isPrimary"), bool) else True,
        )
        for item in payload.get("entries", [])
    )
    return SkillStoreManifest(entries=entries)


def write_skill_store_manifest(path: Path, manifest: SkillStoreManifest) -> None:
    atomic_write_text(
        path,
        json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2) + "\n",
    )


__all__ = [
    "SkillStoreEntry",
    "SkillStoreManifest",
    "load_skill_store_manifest",
    "write_skill_store_manifest",
]
