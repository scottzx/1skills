from __future__ import annotations

from dataclasses import dataclass

from .package import AgentPackage


@dataclass(frozen=True)
class AgentObservation:
    harness: str
    label: str
    scope: str
    package: AgentPackage


@dataclass(frozen=True)
class StoreAgentObservation:
    package: AgentPackage
    recorded_revision: str | None = None
    recorded_source_ref: str | None = None
    recorded_source_path: str | None = None


@dataclass(frozen=True)
class AgentsHarnessScan:
    harness: str
    label: str
    logo_key: str | None
    installed: bool
    agents: tuple[AgentObservation, ...] = ()


@dataclass(frozen=True)
class AgentStoreScan:
    packages: tuple[StoreAgentObservation, ...] = ()
    issues: tuple[str, ...] = ()


__all__ = [
    "AgentObservation",
    "AgentStoreScan",
    "AgentsHarnessScan",
    "StoreAgentObservation",
]
