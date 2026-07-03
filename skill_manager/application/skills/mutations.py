from __future__ import annotations

import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from skill_manager.errors import MutationError

from .contracts import SkillsHarnessAdapter
from .identity import SourceDescriptor
from .inventory import InventoryEntry
from .package import parse_skill_package, set_skill_name
from .policy import can_delete, can_manage, can_stop_managing, can_update, display_status, has_local_changes
from .queries import SkillsQueryService
from .read_models import SkillsReadModelService
from .skillmeta import SkillMeta, read_skill_meta, write_skill_meta
from .source_fetch import SourceFetchService
from .store import slugify_dir


class SkillsMutationService:
    def __init__(
        self,
        read_models: SkillsReadModelService,
        queries: SkillsQueryService,
        source_fetcher: SourceFetchService,
    ) -> None:
        self.read_models = read_models
        self.queries = queries
        self.source_fetcher = source_fetcher

    def enable_skill(self, skill_ref: str, harness: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if entry.kind != "managed":
            raise MutationError(f"only managed skills can be toggled; this is {display_status(entry)}", status=400)
        if entry.package_path is None:
            raise MutationError("managed skill is missing its shared package path", status=500)
        adapter = self.read_models.require_enabled_adapter(harness)
        adapter.enable_shared_package(entry.package_path)
        self.read_models.invalidate()
        return {"ok": True}

    def disable_skill(self, skill_ref: str, harness: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if entry.kind != "managed":
            raise MutationError(f"only managed skills can be toggled; this is {display_status(entry)}", status=400)
        if entry.package_dir is None:
            raise MutationError("managed skill is missing its package directory name", status=500)
        adapter = self.read_models.require_enabled_adapter(harness)
        adapter.disable_shared_package(entry.package_dir)
        self.read_models.invalidate()
        return {"ok": True}

    def set_skill_all_harnesses(self, skill_ref: str, target: str) -> dict[str, object]:
        if target not in ("enabled", "disabled"):
            raise MutationError("target must be 'enabled' or 'disabled'", status=400)
        entry = self.queries.require_entry(skill_ref)
        if entry.kind != "managed":
            raise MutationError(
                f"only managed skills can be toggled; this is {display_status(entry)}",
                status=400,
            )
        if entry.package_dir is None:
            raise MutationError("managed skill is missing its package directory name", status=500)
        if target == "enabled" and entry.package_path is None:
            raise MutationError("managed skill is missing its shared package path", status=500)

        succeeded: list[str] = []
        failures: list[dict[str, str]] = []
        flipped_any = False

        # Bulk set-all only targets harnesses that are installed or otherwise
        # interactable. Enabling on an unavailable harness would write a
        # symlink into a folder no runtime reads, which is misleading.
        for adapter in self.read_models.enabled_installed_adapters():
            has_binding = adapter.has_binding(entry.package_dir)
            if target == "enabled" and has_binding:
                continue
            if target == "disabled" and not has_binding:
                continue
            try:
                if target == "enabled":
                    adapter.enable_shared_package(entry.package_path)  # type: ignore[arg-type]
                else:
                    adapter.disable_shared_package(entry.package_dir)
            except Exception as error:  # noqa: BLE001 — aggregate partial failures
                failures.append({"harness": adapter.harness, "error": str(error)})
                continue
            succeeded.append(adapter.harness)
            flipped_any = True

        if flipped_any:
            self.read_models.invalidate()

        return {
            "ok": not failures,
            "succeeded": succeeded,
            "failed": failures,
        }

    def manage_skill(self, skill_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if entry.kind != "unmanaged":
            raise MutationError(f"only unmanaged skills can be managed; this is {display_status(entry)}", status=400)
        self._manage_entry(entry)
        self.read_models.invalidate()
        return {"ok": True}

    def manage_all_skills(self) -> dict[str, object]:
        inventory = self.queries.inventory()
        managed_count = 0
        skipped_count = 0
        failures: list[dict[str, str]] = []

        for entry in inventory.entries:
            if not can_manage(entry):
                skipped_count += 1
                continue
            try:
                self._manage_entry(entry)
                managed_count += 1
            except MutationError as error:
                failures.append({
                    "skillRef": entry.skill_ref,
                    "name": entry.name,
                    "error": str(error),
                })

        if managed_count:
            self.read_models.invalidate()

        return {
            "ok": not failures,
            "managedCount": managed_count,
            "skippedCount": skipped_count,
            "failures": failures,
        }

    def update_skill(self, skill_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if not can_update(entry):
            if has_local_changes(entry):
                raise MutationError("Local changes detected. Source updates are disabled.", status=400)
            raise MutationError("skill cannot be updated from its source", status=400)
        if entry.package_dir is None:
            raise MutationError("managed skill is missing its package directory name", status=500)
        with TemporaryDirectory(prefix="skill-update-") as work_dir:
            fetched = self.source_fetcher.fetch_package(
                source_kind=entry.source.kind,
                source_locator=entry.source.locator,
                work_dir=Path(work_dir),
            )
            try:
                self.read_models.store.update(
                    entry.package_dir,
                    source_path=fetched.package_path,
                    source_ref=fetched.source_ref,
                    source_path_hint=fetched.source_path,
                )
            except ValueError as error:
                raise MutationError(str(error), status=409) from error
        self.read_models.invalidate()
        return {"ok": True}

    def push_skill_from_path(self, skill_ref: str, source_path: str) -> dict[str, object]:
        """Push a workspace's own skill copy to the shared store (母体) using the
        stable-id decision tree (#379). Reads the workspace sidecar (id +
        baseVersion) and routes:

        - id in store, store.version <= baseVersion → linear update (``updated``,
          or ``exists`` when identical). Silent.
        - id in store, store.version >  baseVersion → concurrent edit: return
          ``conflict`` (creates nothing); the caller must POST /resolve to land
          it as main or fork.
        - no id (or id gone from store) → content-hash dedup: an exact match
          returns ``exists`` (links the workspace to that id); otherwise a new
          package is created (``created``), allowing duplicate names.

        On any non-conflict outcome the workspace sidecar is stamped with the
        resolved id + version so the next push is correctly linear.
        """
        src = Path(source_path)
        if not src.is_dir() or not (src / "SKILL.md").is_file():
            raise MutationError(f"no skill package (missing SKILL.md) at {source_path}", status=400)
        store = self.read_models.store
        meta = read_skill_meta(src)

        try:
            # Branch 1 — known id still in the store.
            if meta is not None and store.entry_for_id(meta.id) is not None:
                entry = store.entry_for_id(meta.id)
                assert entry is not None
                if store.version_of(entry.package_dir) is not None and entry.version > meta.base_version:
                    return {
                        "ok": True,
                        "status": "conflict",
                        "changed": False,
                        "created": False,
                        "id": entry.id,
                        "version": entry.version,
                        "conflict": {
                            "id": entry.id,
                            "name": entry.declared_name,
                            "storeVersion": entry.version,
                            "baseVersion": meta.base_version,
                            "sourcePath": str(src),
                        },
                    }
                _dest, changed = store.update(entry.package_dir, source_path=src)
                fresh = store.entry_for_dir(entry.package_dir)
                assert fresh is not None
                self._stamp_workspace_meta(src, fresh)
                if changed:
                    self.read_models.invalidate()
                return {
                    "ok": True,
                    "status": "updated" if changed else "exists",
                    "changed": changed,
                    "created": False,
                    "id": fresh.id,
                    "version": fresh.version,
                }

            # Branch 2 — no usable id: content-hash dedup, else create.
            package = parse_skill_package(
                src, default_source=SourceDescriptor(kind="centralized", locator="centralized:push")
            )
            duplicate = store.find_by_revision(package.revision)
            if duplicate is not None:
                self._stamp_workspace_meta(src, duplicate)
                return {
                    "ok": True,
                    "status": "exists",
                    "changed": False,
                    "created": False,
                    "id": duplicate.id,
                    "version": duplicate.version,
                }
            dest = store.ingest(
                source_path=src,
                declared_name=package.declared_name,
                source_kind="centralized",
                source_locator=f"centralized:{src.name}",
                allow_duplicate_name=True,
                skill_id=meta.id if meta is not None else None,
                history_source="push",
            )
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        created_entry = store.entry_for_dir(dest.name)
        assert created_entry is not None
        self._stamp_workspace_meta(src, created_entry)
        self.read_models.invalidate()
        return {
            "ok": True,
            "status": "created",
            "changed": True,
            "created": True,
            "id": created_entry.id,
            "version": created_entry.version,
        }

    def resolve_push_conflict(
        self,
        *,
        source_path: str,
        base_id: str,
        resolution: str,
        name: str | None = None,
    ) -> dict[str, object]:
        """Land a concurrent-edit push as a new fork (#379). The pushed content
        always becomes a new package C forked from ``base_id`` @ baseVersion — no
        data is ever overwritten. ``resolution`` only decides who is primary:

        - ``main`` → C becomes primary, the original branch is demoted;
        - ``fork`` → the original stays primary, C is a side branch.

        An optional ``name`` renames the fork (its SKILL.md + folder)."""
        if resolution not in ("main", "fork"):
            raise MutationError("resolution must be 'main' or 'fork'", status=400)
        src = Path(source_path)
        if not src.is_dir() or not (src / "SKILL.md").is_file():
            raise MutationError(f"no skill package (missing SKILL.md) at {source_path}", status=400)
        store = self.read_models.store
        base = store.entry_for_id(base_id)
        if base is None:
            raise MutationError(f"unknown skill id: {base_id}", status=404)
        meta = read_skill_meta(src)
        forked_from_version = meta.base_version if meta is not None else base.version

        fork_name = name.strip() if name and name.strip() else None
        try:
            if fork_name is not None:
                with TemporaryDirectory(prefix="skill-fork-") as work_dir:
                    staged = Path(work_dir) / src.name
                    shutil.copytree(src, staged)
                    set_skill_name(staged, fork_name)
                    dest = store.ingest(
                        source_path=staged,
                        declared_name=fork_name,
                        source_kind="centralized",
                        source_locator="centralized:fork",
                        allow_duplicate_name=True,
                        desired_dir=slugify_dir(fork_name),
                        forked_from=base_id,
                        forked_from_version=forked_from_version,
                        is_primary=False,
                        history_source="fork",
                    )
                # keep the workspace copy's name in sync with its new central fork
                set_skill_name(src, fork_name)
            else:
                package = parse_skill_package(
                    src, default_source=SourceDescriptor(kind="centralized", locator="centralized:fork")
                )
                dest = store.ingest(
                    source_path=src,
                    declared_name=package.declared_name,
                    source_kind="centralized",
                    source_locator="centralized:fork",
                    allow_duplicate_name=True,
                    forked_from=base_id,
                    forked_from_version=forked_from_version,
                    is_primary=False,
                    history_source="fork",
                )
            fork = store.entry_for_dir(dest.name)
            assert fork is not None
            if resolution == "main":
                store.set_primary(fork.id)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        self._stamp_workspace_meta(src, store.entry_for_dir(dest.name))  # type: ignore[arg-type]
        self.read_models.invalidate()
        return {
            "ok": True,
            "id": fork.id,
            "resolution": resolution,
            "version": fork.version,
            "packageDir": dest.name,
        }

    def restore_skill_version(self, skill_id: str, version: int) -> dict[str, object]:
        try:
            new_version = self.read_models.store.restore(skill_id, version)
        except ValueError as error:
            raise MutationError(str(error), status=404) from error
        self.read_models.invalidate()
        return {"ok": True, "id": skill_id, "version": new_version}

    def promote_skill(self, skill_id: str) -> dict[str, object]:
        try:
            self.read_models.store.set_primary(skill_id)
        except ValueError as error:
            raise MutationError(str(error), status=404) from error
        self.read_models.invalidate()
        return {"ok": True, "id": skill_id}

    def _stamp_workspace_meta(self, src: Path, entry) -> None:
        """Write the store's authoritative id + version back into the workspace
        copy's sidecar so a repeat push from the same copy is linear, not a false
        concurrent edit. The sidecar is fingerprint-excluded, so this never marks
        the skill modified."""
        if entry is None:
            return
        existing = read_skill_meta(src)
        write_skill_meta(
            src,
            SkillMeta(
                id=entry.id,
                base_version=entry.version,
                forked_from=entry.forked_from,
                forked_from_version=entry.forked_from_version,
                created_at=existing.created_at if existing else None,
            ),
        )

    def unmanage_skill(self, skill_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if not can_stop_managing(entry):
            raise MutationError(
                f"only managed shared-store skills can be moved back to unmanaged; this is {display_status(entry)}",
                status=400,
            )
        if entry.package_dir is None or entry.package_path is None:
            raise MutationError("managed skill is missing its shared package metadata", status=500)

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
            adapter.prepare_materialize(entry.package_dir, entry.package_path)

        for _harness, adapter in enabled_bindings:
            adapter.materialize_binding(entry.package_dir, entry.package_path)

        try:
            self.read_models.store.delete(entry.package_dir)
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        self.read_models.invalidate()
        return {"ok": True}

    def delete_skill(self, skill_ref: str) -> dict[str, bool]:
        entry = self.queries.require_entry(skill_ref)
        if not can_delete(entry):
            raise MutationError(
                f"only managed shared-store skills can be deleted; this is {display_status(entry)}",
                status=400,
            )
        if entry.package_dir is None:
            raise MutationError("managed skill is missing its package directory name", status=500)

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

    def install_skill(self, *, source_kind: str, source_locator: str) -> dict[str, bool]:
        with TemporaryDirectory(prefix="skill-install-") as work_dir:
            fetched = self.source_fetcher.fetch_package(
                source_kind=source_kind,
                source_locator=source_locator,
                work_dir=Path(work_dir),
            )
            package = parse_skill_package(
                fetched.package_path,
                default_source=SourceDescriptor(kind=source_kind, locator=source_locator),
            )
            try:
                self.read_models.store.ingest(
                    source_path=fetched.package_path,
                    declared_name=package.declared_name,
                    source_kind=source_kind,
                    source_locator=source_locator,
                    source_ref=fetched.source_ref,
                    source_path_hint=fetched.source_path,
                )
            except ValueError as error:
                raise MutationError(str(error), status=409) from error
        self.read_models.invalidate()
        return {"ok": True}

    def resolve_skill_conflict(self, skill_ref: str, chosen_ref: str) -> dict[str, bool]:
        """Consolidate every same-named copy down to one managed version.

        `chosen_ref` is the version the user picked. Its content becomes the
        single shared-store package; enabled canonical harness copies are
        re-pointed at the store (symlink), and the remaining divergent real-dir
        copies elsewhere are deleted. Symlink bindings are left alone — they
        already follow the (now updated) store content.
        """
        chosen = self.queries.require_entry(chosen_ref)
        group = [entry for entry in self.queries.inventory().entries if entry.name == chosen.name]
        if len(group) < 2:
            raise MutationError("no duplicate versions to resolve for this skill", status=400)

        store = self.read_models.store

        # 1. Resolve the chosen version's content (the source we converge on).
        if chosen.kind == "managed":
            if chosen.package_dir is None or chosen.package_path is None:
                raise MutationError("managed skill is missing its package metadata", status=500)
            chosen_source = chosen.package_path
        else:
            sighting = next(
                (s for s in chosen.sightings if s.kind == "harness" and s.path is not None),
                None,
            )
            if sighting is None:
                raise MutationError("no local copy found for the chosen version", status=400)
            chosen_source = sighting.path

        # 2. Make the store hold the chosen content (update in place, or ingest).
        managed = next((entry for entry in group if entry.kind == "managed"), None)
        if managed is not None:
            if managed.package_dir is None:
                raise MutationError("managed skill is missing its package directory name", status=500)
            package_dir = managed.package_dir
            if chosen.kind != "managed":
                try:
                    store.update(package_dir, source_path=chosen_source)
                except ValueError as error:
                    raise MutationError(str(error), status=409) from error
        else:
            source = chosen.source
            if source.is_source_backed:
                source_kind, source_locator = source.kind, source.locator
            else:
                source_kind = "centralized"
                source_locator = f"centralized:{chosen.name}"
            try:
                ingested = store.ingest(
                    source_path=chosen_source,
                    declared_name=chosen.name,
                    source_kind=source_kind,
                    source_locator=source_locator,
                )
            except ValueError as error:
                raise MutationError(str(error), status=409) from error
            package_dir = ingested.name

        store_path = (store.root / package_dir).resolve()

        # 3. Rebind enabled canonical copies to the store; delete divergent strays.
        enabled = set(self.read_models.enabled_harnesses())
        for entry in group:
            for sighting in entry.sightings:
                if sighting.kind != "harness" or sighting.path is None:
                    continue
                path = sighting.path
                # Existing symlink bindings already follow the updated store.
                if path.is_symlink():
                    continue
                if sighting.harness in enabled and sighting.scope == "canonical":
                    adapter = self.read_models.require_enabled_adapter(sighting.harness)
                    adapter.adopt_local_copy(existing_dir=path, package_path=store_path)
                else:
                    self._delete_stray_copy(path, store_path)

        self.read_models.invalidate()
        return {"ok": True}

    def _delete_stray_copy(self, path: Path, store_path: Path) -> None:
        """Delete one divergent copy. Never touches the store or a symlink."""
        try:
            if path.is_symlink():
                return
            if path.resolve() == store_path:
                return
            if path.is_dir():
                shutil.rmtree(path)
        except OSError as error:
            raise MutationError(f"unable to remove duplicate copy at {path}: {error}", status=409) from error

    def _manage_entry(self, entry: InventoryEntry) -> None:
        harness_sightings = [s for s in entry.sightings if s.kind == "harness" and s.path is not None]
        if not harness_sightings:
            raise MutationError("no local skill copy found to manage", status=400)
        # Only bind harnesses that are actually installed & enabled. A single
        # on-disk copy (e.g. ~/.agents/skills/<skill>) is co-discovered through
        # several harnesses' discovery roots; binding an uninstalled one would
        # abort the whole manage with a 400.
        installed_harnesses = {a.harness for a in self.read_models.enabled_installed_adapters()}
        harness_sightings = [s for s in harness_sightings if s.harness in installed_harnesses]
        if not harness_sightings:
            raise MutationError("no installed harness available to manage this skill", status=400)
        source = harness_sightings[0].source
        if source.is_source_backed:
            source_kind, source_locator = source.kind, source.locator
        else:
            source_kind = "centralized"
            source_locator = f"centralized:{entry.name}"
        try:
            ingested = self.read_models.store.ingest(
                source_path=harness_sightings[0].path,
                declared_name=entry.name,
                source_kind=source_kind,
                source_locator=source_locator,
            )
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        canonical_bound_harnesses: set[str] = set()
        for sighting in harness_sightings:
            adapter = self.read_models.require_enabled_adapter(sighting.harness)
            if sighting.scope == "canonical":
                adapter.adopt_local_copy(existing_dir=sighting.path, package_path=ingested)
                canonical_bound_harnesses.add(sighting.harness)
        for sighting in harness_sightings:
            if sighting.harness in canonical_bound_harnesses:
                continue
            adapter = self.read_models.require_enabled_adapter(sighting.harness)
            adapter.enable_shared_package(ingested)
            canonical_bound_harnesses.add(sighting.harness)

    def _partition_bound_adapters(
        self,
        package_dir: str,
    ) -> tuple[list[tuple[str, SkillsHarnessAdapter]], list[tuple[str, SkillsHarnessAdapter]]]:
        enabled = set(self.read_models.enabled_harnesses())
        enabled_bindings: list[tuple[str, SkillsHarnessAdapter]] = []
        disabled_bindings: list[tuple[str, SkillsHarnessAdapter]] = []
        for adapter in self.read_models.all_adapters():
            if not adapter.has_binding(package_dir):
                continue
            if adapter.harness in enabled:
                enabled_bindings.append((adapter.harness, adapter))
            else:
                disabled_bindings.append((adapter.harness, adapter))
        return enabled_bindings, disabled_bindings

    def _describe_harnesses(self, bindings: list[tuple[str, SkillsHarnessAdapter]]) -> str:
        return ", ".join(adapter.label for _harness, adapter in bindings)
