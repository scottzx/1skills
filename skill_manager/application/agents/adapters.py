from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
import shutil

from skill_manager.errors import MutationError
from skill_manager.harness import (
    FileTreeAvailability,
    FileTreeBindingProfile,
    HarnessKernelService,
)

from ..skills.identity import SourceDescriptor
from .contracts import AgentsHarnessAdapter, AgentsHarnessStatus
from .observations import AgentObservation, AgentsHarnessScan
from .package import AgentParseError, find_agent_files, parse_agent_file


class AgentsFileAdapter(AgentsHarnessAdapter):
    """Manage single ``<name>.md`` agent files in a harness ``managed_root``
    (``~/.claude/agents``) via symlinks into the shared store, and scan discovery
    roots for existing agent files."""

    def __init__(
        self,
        *,
        harness: str,
        label: str,
        logo_key: str | None,
        install_probe: str,
        path_env: str | None,
        managed_root: Path,
        discovery_roots: tuple["_ResolvedRoot", ...],
        availability: FileTreeAvailability,
        app_probe_paths: tuple[Path, ...],
    ) -> None:
        self.harness = harness
        self.label = label
        self.logo_key = logo_key
        self._install_probe = install_probe
        self._path_env = path_env
        self.managed_root = managed_root
        self._discovery_roots = self._dedupe_roots(discovery_roots)
        self._availability = availability
        self._app_probe_paths = app_probe_paths

    def status(self) -> AgentsHarnessStatus:
        return AgentsHarnessStatus(
            harness=self.harness,
            label=self.label,
            logo_key=self.logo_key,
            installed=self._is_installed(),
            managed_root=self.managed_root,
        )

    def scan(self) -> AgentsHarnessScan:
        observations = _scan_agent_roots(
            harness=self.harness,
            label=self.label,
            roots=self._discovery_roots,
        )
        return AgentsHarnessScan(
            harness=self.harness,
            label=self.label,
            logo_key=self.logo_key,
            installed=self._is_installed(),
            agents=tuple(observations),
        )

    def enable_shared_package(self, package_path: Path) -> None:
        resolved_target = package_path.resolve()
        link = self.managed_root / package_path.name
        if link.is_symlink():
            if link.resolve() == resolved_target:
                return
            raise MutationError(
                f"symlink already exists but points to {link.resolve()}, not {resolved_target}"
            )
        if link.exists():
            raise MutationError(f"real file exists at {link}; will not overwrite")
        self.managed_root.mkdir(parents=True, exist_ok=True)
        link.symlink_to(resolved_target)

    def disable_shared_package(self, package_dir: str) -> None:
        link = self.managed_root / package_dir
        if not link.exists() and not link.is_symlink():
            return
        if not link.is_symlink():
            raise MutationError(f"not a symlink at {link}; will not delete real file")
        link.unlink()

    def has_binding(self, package_dir: str) -> bool:
        candidate = self.managed_root / package_dir
        return candidate.exists() or candidate.is_symlink()

    def prepare_remove(self, package_dir: str) -> None:
        link = self.managed_root / package_dir
        if not link.exists() and not link.is_symlink():
            return
        if not link.is_symlink():
            raise MutationError(f"not a symlink at {link}; will not delete real file")

    def remove_binding(self, package_dir: str) -> None:
        self.disable_shared_package(package_dir)

    def invalidate(self) -> None:
        return None

    def _is_installed(self) -> bool:
        cli_available = shutil.which(self._install_probe, path=self._path_env) is not None
        if self._availability == "cli":
            return cli_available
        if self._availability == "cli_or_app":
            return cli_available or any(path.exists() for path in self._app_probe_paths)
        return cli_available

    def _dedupe_roots(
        self,
        roots: tuple["_ResolvedRoot", ...],
    ) -> tuple["_ResolvedRoot", ...]:
        selected: list[_ResolvedRoot] = []
        seen: set[Path] = set()
        for root in roots:
            path = root.path.resolve(strict=False)
            if path in seen:
                continue
            seen.add(path)
            selected.append(root)
        return tuple(selected)


@dataclass(frozen=True)
class _ResolvedRoot:
    kind: str
    scope: str
    label: str
    path: Path


def build_agents_adapters(kernel: HarnessKernelService) -> tuple[AgentsFileAdapter, ...]:
    adapters: list[AgentsFileAdapter] = []
    for binding in kernel.bindings_for_family("agents"):
        definition = binding.definition
        profile = binding.profile
        if not isinstance(profile, FileTreeBindingProfile):
            continue
        managed_root = profile.resolve_managed_root(kernel.context)
        resolved_roots = (
            _ResolvedRoot(
                kind="managed-root",
                scope="canonical",
                label="Managed agents root",
                path=managed_root,
            ),
            *tuple(
                _ResolvedRoot(
                    kind=root.kind,
                    scope=root.scope,
                    label=root.label,
                    path=root.path_resolver(kernel.context),
                )
                for root in profile.discovery_roots
            ),
        )
        adapters.append(
            AgentsFileAdapter(
                harness=definition.harness,
                label=definition.label,
                logo_key=definition.logo_key,
                install_probe=definition.install_probe,
                path_env=kernel.context.env.get("PATH"),
                managed_root=managed_root,
                discovery_roots=resolved_roots,
                availability=profile.availability,
                app_probe_paths=tuple(
                    resolver(kernel.context) for resolver in profile.app_probe_paths
                ),
            )
        )
    return tuple(adapters)


def scan_all_adapters(adapters: tuple[AgentsHarnessAdapter, ...]) -> tuple[AgentsHarnessScan, ...]:
    if not adapters:
        return ()
    with ThreadPoolExecutor(max_workers=len(adapters)) as executor:
        return tuple(executor.map(lambda adapter: adapter.scan(), adapters))


def _scan_agent_roots(
    *,
    harness: str,
    label: str,
    roots: tuple[_ResolvedRoot, ...],
) -> list[AgentObservation]:
    observations: list[AgentObservation] = []
    for root in roots:
        for agent_file in find_agent_files(root.path):
            try:
                package = parse_agent_file(
                    agent_file,
                    default_source=SourceDescriptor(
                        kind="harness-local",
                        locator=f"{harness}:{root.scope}:{agent_file.name}",
                    ),
                )
            except AgentParseError:
                continue
            observations.append(
                AgentObservation(
                    harness=harness,
                    label=label,
                    scope=root.scope,
                    package=package,
                )
            )
    return observations


__all__ = ["AgentsFileAdapter", "build_agents_adapters", "scan_all_adapters"]
