from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from .identity import SourceDescriptor, stable_id
from .observations import SkillStoreScan, SkillsHarnessScan
from .skillmeta import read_skill_meta


EntryKind = Literal["managed", "unmanaged"]


@dataclass(frozen=True)
class InventoryColumn:
    harness: str
    label: str
    logo_key: str | None
    installed: bool


@dataclass(frozen=True)
class InventorySighting:
    kind: Literal["shared", "harness"]
    harness: str | None
    label: str
    scope: str | None
    path: Path | None
    revision: str | None
    source: SourceDescriptor
    detail: str = ""


@dataclass
class InventoryEntry:
    skill_ref: str
    name: str
    description: str
    kind: EntryKind
    source: SourceDescriptor
    current_revision: str | None = None
    recorded_revision: str | None = None
    source_ref: str | None = None
    source_path: str | None = None
    package_dir: str | None = None
    package_path: Path | None = None
    skill_id: str | None = None
    version: int = 1
    forked_from: str | None = None
    forked_from_version: int | None = None
    is_primary: bool = True
    primary_tag: str | None = None
    secondary_tag: str | None = None
    sightings: list[InventorySighting] = field(default_factory=list)

    def add_sighting(self, sighting: InventorySighting) -> None:
        self.sightings.append(sighting)

    def detail_sightings(self) -> list[InventorySighting]:
        order = {"shared": 0, "harness": 1}
        return sorted(
            self.sightings,
            key=lambda item: (
                order.get(item.kind, 99),
                item.harness or "",
                item.scope or "",
                item.label,
                str(item.path) if item.path is not None else "",
            ),
        )

    def linked_harnesses(self) -> set[str]:
        return {
            sighting.harness
            for sighting in self.sightings
            if sighting.kind == "harness" and sighting.harness is not None and sighting.scope == "canonical"
        }


class SkillInventory:
    def __init__(
        self,
        *,
        columns: tuple[InventoryColumn, ...],
        harness_scans: tuple[HarnessScan, ...],
        store_issues: tuple[str, ...],
        entries: tuple[InventoryEntry, ...],
    ) -> None:
        self.columns = columns
        self.harness_scans = harness_scans
        self.store_issues = store_issues
        self.entries = entries
        self._by_ref = {entry.skill_ref: entry for entry in entries}

    @classmethod
    def from_snapshot(
        cls,
        *,
        store_scan: SkillStoreScan,
        harness_scans: tuple[SkillsHarnessScan, ...],
    ) -> "SkillInventory":
        from .policy import sort_entries

        columns = tuple(
            InventoryColumn(
                harness=scan.harness,
                label=scan.label,
                logo_key=scan.logo_key,
                installed=scan.installed,
            )
            for scan in harness_scans
        )
        entries: list[InventoryEntry] = []
        shared_path_index: dict[Path, InventoryEntry] = {}
        shared_match_index: dict[str, InventoryEntry] = {}

        for store_package in store_scan.packages:
            package = store_package.package
            entry = InventoryEntry(
                skill_ref=f"shared:{package.root_path.name}",
                name=package.declared_name,
                description=package.description,
                kind="managed",
                source=package.source,
                current_revision=package.revision,
                recorded_revision=store_package.recorded_revision,
                source_ref=store_package.recorded_source_ref,
                source_path=store_package.recorded_source_path,
                package_dir=package.root_path.name,
                package_path=package.root_path,
                skill_id=store_package.recorded_id,
                version=store_package.recorded_version,
                forked_from=store_package.recorded_forked_from,
                forked_from_version=store_package.recorded_forked_from_version,
                is_primary=store_package.recorded_is_primary,
                primary_tag=store_package.recorded_primary_tag,
                secondary_tag=store_package.recorded_secondary_tag,
            )
            entry.add_sighting(
                InventorySighting(
                    kind="shared",
                    harness=None,
                    label="Shared Store",
                    scope=None,
                    path=package.root_path,
                    revision=package.revision,
                    source=package.source,
                )
            )
            entries.append(entry)
            shared_path_index[package.resolved_path] = entry
            shared_match_index[_managed_entry_key(entry)] = entry

        unmanaged_entries: dict[str, InventoryEntry] = {}

        for scan in harness_scans:
            for observation in scan.skills:
                shared_entry = shared_path_index.get(observation.package.resolved_path)
                sighting = InventorySighting(
                    kind="harness",
                    harness=observation.harness,
                    label=observation.label,
                    scope=observation.scope,
                    path=observation.package.root_path,
                    revision=observation.package.revision,
                    source=observation.package.source,
                )
                if shared_entry is not None:
                    shared_entry.add_sighting(sighting)
                    continue
                shared_match = shared_match_index.get(_observation_match_key(observation.package))
                if shared_match is not None:
                    shared_match.add_sighting(sighting)
                    continue

                key = _unmanaged_entry_key(
                    observation.package.declared_name,
                    observation.package.source,
                    observation.package.revision,
                )
                entry = unmanaged_entries.get(key)
                if entry is None:
                    meta = read_skill_meta(observation.package.root_path)
                    ptag = meta.primary_tag if meta else None
                    stag = meta.secondary_tag if meta else None
                    entry = InventoryEntry(
                        skill_ref=f"unmanaged:{key}",
                        name=observation.package.declared_name,
                        description=observation.package.description,
                        kind="unmanaged",
                        source=observation.package.source,
                        current_revision=observation.package.revision,
                        primary_tag=ptag,
                        secondary_tag=stag,
                    )
                    unmanaged_entries[key] = entry
                entry.add_sighting(sighting)

        entries.extend(unmanaged_entries.values())
        sort_entries(entries)
        return cls(
            columns=columns,
            harness_scans=harness_scans,
            store_issues=store_scan.issues,
            entries=tuple(entries),
        )

    def find(self, skill_ref: str) -> InventoryEntry | None:
        return self._by_ref.get(skill_ref)

    def entries_by_kind(self, kind: EntryKind) -> tuple[InventoryEntry, ...]:
        return tuple(entry for entry in self.entries if entry.kind == kind)

    def conflict_groups(self) -> dict[str, tuple[InventoryEntry, ...]]:
        """Names that resolve to more than one distinct version.

        Each inventory entry is one version (managed store package, or an
        unmanaged copy keyed by name+revision). When a single skill name maps to
        two or more entries — e.g. a managed version plus a divergent unmanaged
        copy the user downloaded elsewhere — those versions collide on the
        store's directory-name key and need consolidation.
        """
        by_name: dict[str, list[InventoryEntry]] = {}
        for entry in self.entries:
            by_name.setdefault(entry.name, []).append(entry)
        groups: dict[str, tuple[InventoryEntry, ...]] = {}
        for name, group in by_name.items():
            if len(group) < 2:
                continue
            # #379: managed store packages with distinct stable ids are
            # intentional coexisting copies (e.g. forks in one lineage) — they
            # coexist silently, not a conflict. Only flag when a divergent
            # unmanaged copy is in the mix (the original consolidation case).
            if all(entry.kind == "managed" and entry.skill_id for entry in group):
                continue
            groups[name] = tuple(group)
        return groups


def _unmanaged_entry_key(declared_name: str, source: SourceDescriptor, revision: str) -> str:
    if source.is_source_backed:
        return stable_id("unmanaged", source.kind, source.locator, declared_name, revision)
    return stable_id("unmanaged", declared_name, revision)


def _managed_entry_key(entry: InventoryEntry) -> str:
    if entry.source.kind == "centralized":
        return stable_id("managed-centralized", entry.name, entry.current_revision or "")
    return stable_id("managed", entry.source.kind, entry.source.locator, entry.name, entry.current_revision or "")


def _observation_match_key(package) -> str:
    if package.source.is_source_backed:
        return stable_id("managed", package.source.kind, package.source.locator, package.declared_name, package.revision)
    return stable_id("managed-centralized", package.declared_name, package.revision)
