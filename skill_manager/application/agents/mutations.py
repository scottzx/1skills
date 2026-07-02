from __future__ import annotations

import shutil
from pathlib import Path

from skill_manager.errors import MutationError

from ..skills.identity import SourceDescriptor
from .contracts import AgentsHarnessAdapter
from .inventory import InventoryEntry
from .package import parse_agent_file
from .policy import can_delete, can_manage, can_stop_managing, display_status
from .queries import AgentsQueryService
from .read_models import AgentsReadModelService


class AgentsMutationService:
    def __init__(
        self,
        read_models: AgentsReadModelService,
        queries: AgentsQueryService,
    ) -> None:
        self.read_models = read_models
        self.queries = queries

    def enable_agent(self, agent_ref: str, harness: str) -> dict[str, bool]:
        entry = self.queries.require_entry(agent_ref)
        if entry.kind != "managed":
            raise MutationError(f"only managed agents can be toggled; this is {display_status(entry)}", status=400)
        if entry.package_path is None:
            raise MutationError("managed agent is missing its shared package path", status=500)
        adapter = self.read_models.require_enabled_adapter(harness)
        adapter.enable_shared_package(entry.package_path)
        self.read_models.invalidate()
        return {"ok": True}

    def disable_agent(self, agent_ref: str, harness: str) -> dict[str, bool]:
        entry = self.queries.require_entry(agent_ref)
        if entry.kind != "managed":
            raise MutationError(f"only managed agents can be toggled; this is {display_status(entry)}", status=400)
        if entry.package_dir is None:
            raise MutationError("managed agent is missing its package file name", status=500)
        adapter = self.read_models.require_enabled_adapter(harness)
        adapter.disable_shared_package(entry.package_dir)
        self.read_models.invalidate()
        return {"ok": True}

    def manage_agent(self, agent_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(agent_ref)
        if entry.kind != "unmanaged":
            raise MutationError(f"only unmanaged agents can be managed; this is {display_status(entry)}", status=400)
        self._manage_entry(entry)
        self.read_models.invalidate()
        return {"ok": True}

    def push_agent_from_path(self, agent_ref: str, source_path: str) -> dict[str, object]:
        """Push a workspace's own agent copy to the shared store (母体), keyed by
        its file name (from agent_ref):

        - store already has the file → overwrite it (``store.update``); no-ops
          (``changed=False``) when identical.
        - store doesn't have it → ingest it as a new ``centralized:`` package
          (``created=True``).
        """
        src = Path(source_path)
        if not src.is_file():
            raise MutationError(f"no agent file at {source_path}", status=400)
        package_dir = Path(agent_ref.rsplit(":", 1)[-1]).name
        if not package_dir:
            raise MutationError(f"invalid agent ref: {agent_ref}", status=400)
        store = self.read_models.store
        created = False
        try:
            if (store.root / package_dir).is_file():
                _dest, changed = store.update(package_dir, source_path=src)
            else:
                package = parse_agent_file(
                    src,
                    default_source=SourceDescriptor(kind="centralized", locator=f"centralized:{package_dir}"),
                )
                store.ingest(
                    source_path=src,
                    declared_name=package.declared_name,
                    source_kind="centralized",
                    source_locator=f"centralized:{package_dir}",
                )
                changed, created = True, True
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        if changed:
            self.read_models.invalidate()
        return {"ok": True, "changed": changed, "created": created}

    def unmanage_agent(self, agent_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(agent_ref)
        if not can_stop_managing(entry):
            raise MutationError(
                f"only managed shared-store agents can be moved back to unmanaged; this is {display_status(entry)}",
                status=400,
            )
        if entry.package_dir is None or entry.package_path is None:
            raise MutationError("managed agent is missing its shared package metadata", status=500)

        enabled_bindings, disabled_bindings = self._partition_bound_adapters(entry.package_dir)
        if disabled_bindings:
            raise MutationError(
                "cannot stop managing while disabled harnesses still have bindings: "
                f"{self._describe_harnesses(disabled_bindings)}; re-enable support or clean them manually",
                status=409,
            )
        if not enabled_bindings:
            raise MutationError("turn on at least one harness before stopping management", status=400)

        try:
            self.read_models.store.ensure_deletable(entry.package_dir)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error

        for _harness, adapter in enabled_bindings:
            self._materialize_symlink(adapter, entry.package_dir, entry.package_path)

        try:
            self.read_models.store.delete(entry.package_dir)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        self.read_models.invalidate()
        return {"ok": True}

    def delete_agent(self, agent_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(agent_ref)
        if not can_delete(entry):
            raise MutationError(
                f"only managed shared-store agents can be deleted; this is {display_status(entry)}",
                status=400,
            )
        if entry.package_dir is None:
            raise MutationError("managed agent is missing its package file name", status=500)

        enabled_bindings, disabled_bindings = self._partition_bound_adapters(entry.package_dir)
        if disabled_bindings:
            raise MutationError(
                "cannot delete while disabled harnesses still have bindings: "
                f"{self._describe_harnesses(disabled_bindings)}; re-enable support or clean them manually",
                status=409,
            )
        try:
            self.read_models.store.ensure_deletable(entry.package_dir)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        for _harness, adapter in enabled_bindings:
            adapter.prepare_remove(entry.package_dir)
        for _harness, adapter in enabled_bindings:
            adapter.remove_binding(entry.package_dir)
        try:
            self.read_models.store.delete(entry.package_dir)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        self.read_models.invalidate()
        return {"ok": True}

    def _materialize_symlink(
        self,
        adapter: AgentsHarnessAdapter,
        package_dir: str,
        package_path: Path,
    ) -> None:
        """Replace a harness's symlink into the store with a real copy of the
        agent file, so stopping management leaves the workspace copy intact."""
        link = adapter.managed_root / package_dir
        if not link.is_symlink():
            return
        resolved = package_path.resolve()
        if link.resolve() != resolved:
            raise MutationError(
                f"symlink exists but points to {link.resolve()}, not {resolved}",
                status=409,
            )
        link.unlink()
        shutil.copy2(resolved, link)

    def _manage_entry(self, entry: InventoryEntry) -> None:
        harness_sightings = [s for s in entry.sightings if s.kind == "harness" and s.path is not None]
        if not harness_sightings:
            raise MutationError("no local agent copy found to manage", status=400)
        installed_harnesses = {a.harness for a in self.read_models.enabled_installed_adapters()}
        harness_sightings = [s for s in harness_sightings if s.harness in installed_harnesses]
        if not harness_sightings:
            raise MutationError("no installed harness available to manage this agent", status=400)
        source = harness_sightings[0].source
        if source.is_source_backed:
            source_kind, source_locator = source.kind, source.locator
        else:
            source_kind = "centralized"
            source_locator = f"centralized:{harness_sightings[0].path.name}"
        try:
            ingested = self.read_models.store.ingest(
                source_path=harness_sightings[0].path,
                declared_name=entry.name,
                source_kind=source_kind,
                source_locator=source_locator,
            )
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        for sighting in harness_sightings:
            adapter = self.read_models.require_enabled_adapter(sighting.harness)
            if sighting.scope == "canonical":
                self._adopt_local_copy(adapter, sighting.path, ingested)
            else:
                adapter.enable_shared_package(ingested)

    def _adopt_local_copy(self, adapter: AgentsHarnessAdapter, existing_file: Path, package_path: Path) -> None:
        resolved = package_path.resolve()
        if existing_file.is_symlink():
            if existing_file.resolve() == resolved:
                return
            raise MutationError(
                f"symlink exists but points to {existing_file.resolve()}, not {resolved}",
                status=409,
            )
        if existing_file.exists():
            existing_file.unlink()
        existing_file.symlink_to(resolved)

    def _partition_bound_adapters(
        self,
        package_dir: str,
    ) -> tuple[list[tuple[str, AgentsHarnessAdapter]], list[tuple[str, AgentsHarnessAdapter]]]:
        enabled = set(self.read_models.enabled_harnesses())
        enabled_bindings: list[tuple[str, AgentsHarnessAdapter]] = []
        disabled_bindings: list[tuple[str, AgentsHarnessAdapter]] = []
        for adapter in self.read_models.all_adapters():
            if not adapter.has_binding(package_dir):
                continue
            if adapter.harness in enabled:
                enabled_bindings.append((adapter.harness, adapter))
            else:
                disabled_bindings.append((adapter.harness, adapter))
        return enabled_bindings, disabled_bindings

    def _describe_harnesses(self, bindings: list[tuple[str, AgentsHarnessAdapter]]) -> str:
        return ", ".join(adapter.label for _harness, adapter in bindings)
