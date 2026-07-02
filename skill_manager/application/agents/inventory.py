from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ..skills.identity import SourceDescriptor, stable_id
from .observations import AgentStoreScan, AgentsHarnessScan


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
    agent_ref: str
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


class AgentInventory:
    def __init__(
        self,
        *,
        columns: tuple[InventoryColumn, ...],
        harness_scans: tuple[AgentsHarnessScan, ...],
        store_issues: tuple[str, ...],
        entries: tuple[InventoryEntry, ...],
    ) -> None:
        self.columns = columns
        self.harness_scans = harness_scans
        self.store_issues = store_issues
        self.entries = entries
        self._by_ref = {entry.agent_ref: entry for entry in entries}

    @classmethod
    def from_snapshot(
        cls,
        *,
        store_scan: AgentStoreScan,
        harness_scans: tuple[AgentsHarnessScan, ...],
    ) -> "AgentInventory":
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

        for store_package in store_scan.packages:
            package = store_package.package
            entry = InventoryEntry(
                agent_ref=f"shared:{package.root_path.name}",
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

        unmanaged_entries: dict[str, InventoryEntry] = {}

        for scan in harness_scans:
            for observation in scan.agents:
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

                key = _unmanaged_entry_key(
                    observation.package.declared_name,
                    observation.package.revision,
                )
                entry = unmanaged_entries.get(key)
                if entry is None:
                    entry = InventoryEntry(
                        agent_ref=f"unmanaged:{key}",
                        name=observation.package.declared_name,
                        description=observation.package.description,
                        kind="unmanaged",
                        source=observation.package.source,
                        current_revision=observation.package.revision,
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

    def find(self, agent_ref: str) -> InventoryEntry | None:
        return self._by_ref.get(agent_ref)

    def entries_by_kind(self, kind: EntryKind) -> tuple[InventoryEntry, ...]:
        return tuple(entry for entry in self.entries if entry.kind == kind)


def _unmanaged_entry_key(declared_name: str, revision: str) -> str:
    return stable_id("unmanaged", declared_name, revision)


__all__ = [
    "AgentInventory",
    "InventoryColumn",
    "InventoryEntry",
    "InventorySighting",
]
