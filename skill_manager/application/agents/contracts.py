from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .observations import AgentsHarnessScan


@dataclass(frozen=True)
class AgentsHarnessStatus:
    harness: str
    label: str
    logo_key: str | None
    installed: bool
    managed_root: Path


class AgentsHarnessAdapter(Protocol):
    harness: str
    label: str
    logo_key: str | None
    managed_root: Path

    def status(self) -> AgentsHarnessStatus: ...

    def scan(self) -> AgentsHarnessScan: ...

    def enable_shared_package(self, package_path: Path) -> None: ...

    def disable_shared_package(self, package_dir: str) -> None: ...

    def has_binding(self, package_dir: str) -> bool: ...

    def prepare_remove(self, package_dir: str) -> None: ...

    def remove_binding(self, package_dir: str) -> None: ...

    def invalidate(self) -> None: ...


__all__ = ["AgentsHarnessAdapter", "AgentsHarnessStatus"]
