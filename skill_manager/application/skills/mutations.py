from __future__ import annotations

import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from skill_manager.errors import MutationError

from .contracts import SkillsHarnessAdapter
from .identity import SourceDescriptor
from .inventory import InventoryEntry
from .package import fingerprint_package, parse_skill_package, set_skill_name
from .pending_conflicts import PendingConflictStore
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
        pending_conflicts: PendingConflictStore,
    ) -> None:
        self.read_models = read_models
        self.queries = queries
        self.source_fetcher = source_fetcher
        self.pending_conflicts = pending_conflicts

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
          returns ``exists`` (links the workspace to that id). Else, if the
          package dir name matches an existing store package (a legacy copy of a
          known skill, pre-sidecar) and the content differs, we can't prove a
          clean linear lineage → ``conflict`` (dialog: update-as-main or fork).
          Otherwise it's genuinely new → ``created``.

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
                        "conflict": self._stage_conflict(
                            base_id=entry.id,
                            base_name=entry.declared_name,
                            store_version=entry.version,
                            base_version=meta.base_version,
                            src=src,
                        ),
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
            # Divergent legacy push: dir name matches a known store package but
            # content differs and there's no sidecar to prove linear lineage.
            # Surface the conflict dialog (update-as-main or fork) rather than
            # silently spawning a duplicate. baseVersion=0 marks "untracked".
            legacy_dir = Path(skill_ref.rsplit(":", 1)[-1]).name if skill_ref else ""
            legacy = store.entry_for_dir(legacy_dir) if legacy_dir else None
            if legacy is not None:
                return {
                    "ok": True,
                    "status": "conflict",
                    "changed": False,
                    "created": False,
                    "id": legacy.id,
                    "version": legacy.version,
                    "conflict": self._stage_conflict(
                        base_id=legacy.id,
                        base_name=legacy.declared_name,
                        store_version=legacy.version,
                        base_version=0,
                        src=src,
                    ),
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

    def pull_skill_to_path(self, skill_ref: str, target_path: str) -> dict[str, object]:
        """Fast-forward a workspace's skill copy to the store's current version
        (母体 → 项目). Only pulls when the workspace copy is *clean* (identical to
        the version it was taken from); a locally-edited copy returns ``dirty``
        without touching anything, so the user first pushes or discards.

        Returns ``{status: pulled|uptodate|dirty, version}``:
        - ``uptodate`` — nothing to pull (not in store, or already at store version).
        - ``dirty`` — store advanced but the workspace copy has local edits.
        - ``pulled`` — store content copied in + sidecar restamped to store version.
        """
        tgt = Path(target_path)
        if not tgt.is_dir() or not (tgt / "SKILL.md").is_file():
            raise MutationError(f"no skill package (missing SKILL.md) at {target_path}", status=400)
        store = self.read_models.store
        meta = read_skill_meta(tgt)
        entry = store.entry_for_id(meta.id) if meta is not None and meta.id else None
        if entry is None:
            legacy_dir = Path(skill_ref.rsplit(":", 1)[-1]).name if skill_ref else ""
            entry = store.entry_for_dir(legacy_dir) if legacy_dir else None
        if entry is None:
            # Not tracked in the store — nothing to pull.
            return {"ok": True, "status": "uptodate", "version": 0}

        # Already identical to the store's current content. If the sidecar is
        # missing or its base_version lags the store (e.g. a copy dropped in
        # without a sidecar, or a content-identical version bump), fast-forward
        # the pointer so the copy reads as synced instead of forever advertising
        # an "update" that has nothing to apply. Content is untouched.
        if not store.differs_from(entry.package_dir, tgt):
            if meta is None or meta.base_version < entry.version:
                self._stamp_workspace_meta(tgt, entry)
                return {"ok": True, "status": "pulled", "version": entry.version}
            return {"ok": True, "status": "uptodate", "version": entry.version}

        # The workspace differs from the *current* store content. Fast-forward is
        # only safe when the copy is unchanged from the version it was taken from
        # (base_version snapshot); otherwise those are local edits — refuse.
        clean = False
        base_version = meta.base_version if meta is not None else None
        if base_version is not None and store.history.has_version(entry.id, base_version):
            snapshot = store.history.version_path(entry.id, base_version)
            clean = fingerprint_package(tgt)[0] == fingerprint_package(snapshot)[0]
        if not clean:
            return {"ok": True, "status": "dirty", "version": entry.version}

        version = store.pull_to_path(entry.package_dir, tgt)
        return {"ok": True, "status": "pulled", "version": version}

    def resolve_push_conflict(
        self,
        *,
        source_path: str,
        base_id: str,
        resolution: str,
        name: str | None = None,
    ) -> dict[str, object]:
        """Resolve a divergent / concurrent-edit push (#379). Non-destructive
        either way — the base package's prior versions always stay in history:

        - ``main`` → update the base package in place (content → pushed, version
          bumped; old versions kept in history). One package.
        - ``fork`` → land the pushed content as a new fork package of ``base_id``;
          the base stays as-is. Two packages.

        An optional ``name`` renames the skill (SKILL.md); on ``fork`` it also
        names the new folder."""
        if resolution not in ("main", "fork"):
            raise MutationError("resolution must be 'main' or 'fork'", status=400)
        src = Path(source_path)
        if not src.is_dir() or not (src / "SKILL.md").is_file():
            raise MutationError(f"no skill package (missing SKILL.md) at {source_path}", status=400)
        store = self.read_models.store
        base = store.entry_for_id(base_id)
        if base is None:
            raise MutationError(f"unknown skill id: {base_id}", status=404)
        new_name = name.strip() if name and name.strip() else None

        try:
            if resolution == "main":
                # In-place update of the base package: replace content, bump
                # version, keep prior versions in history. Stays one package.
                if new_name is not None:
                    set_skill_name(src, new_name)
                _dest, _changed = store.update(base.package_dir, source_path=src)
                landed = store.entry_for_dir(base.package_dir)
                assert landed is not None
                self._stamp_workspace_meta(src, landed)
                self.read_models.invalidate()
                return {
                    "ok": True,
                    "id": landed.id,
                    "resolution": "main",
                    "version": landed.version,
                    "packageDir": base.package_dir,
                }

            # fork → land as a new package forked from base.
            meta = read_skill_meta(src)
            forked_from_version = meta.base_version if meta is not None and meta.base_version else base.version
            if new_name is not None:
                with TemporaryDirectory(prefix="skill-fork-") as work_dir:
                    staged = Path(work_dir) / src.name
                    shutil.copytree(src, staged)
                    set_skill_name(staged, new_name)
                    dest = store.ingest(
                        source_path=staged,
                        declared_name=new_name,
                        source_kind="centralized",
                        source_locator="centralized:fork",
                        allow_duplicate_name=True,
                        desired_dir=slugify_dir(new_name),
                        forked_from=base_id,
                        forked_from_version=forked_from_version,
                        is_primary=False,
                        history_source="fork",
                    )
                set_skill_name(src, new_name)  # keep workspace copy in sync
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
        except ValueError as error:
            raise MutationError(str(error), status=409) from error
        fork = store.entry_for_dir(dest.name)
        assert fork is not None
        self._stamp_workspace_meta(src, fork)
        self.read_models.invalidate()
        return {
            "ok": True,
            "id": fork.id,
            "resolution": "fork",
            "version": fork.version,
            "packageDir": dest.name,
        }

    def resolve_pending_conflict(
        self,
        *,
        conflict_id: str,
        resolution: str,
        name: str | None = None,
    ) -> dict[str, object]:
        """Resolve one pending push conflict from the central inbox, landing the
        *staged snapshot* (not the live workspace path, which may be gone):

        - ``dismiss`` → drop the staged snapshot; the store is untouched.
        - ``main`` → in-place update of the base package (content → staged,
          version bumped, prior versions kept in history). This deliberately
          diverges from #379's "land a fork then flip isPrimary": for the inbox,
          'main' means "this push becomes the base's new mainline", and an
          in-place update keeps lineage clean (no throwaway sibling fork) while
          staying non-destructive.
        - ``fork`` → land the staged content as a new fork of the base; base stays.

        On main/fork the original workspace sidecar is re-stamped best-effort so
        its next push is linear; resolution never fails if that copy is gone."""
        if resolution not in ("main", "fork", "dismiss"):
            raise MutationError("resolution must be 'main', 'fork' or 'dismiss'", status=400)
        record = self.pending_conflicts.get(conflict_id)
        if record is None:
            raise MutationError(f"unknown conflict id: {conflict_id}", status=404)

        if resolution == "dismiss":
            self.pending_conflicts.remove(conflict_id)
            return {"ok": True, "resolution": "dismiss", "conflictId": conflict_id}

        store = self.read_models.store
        base = store.entry_for_id(record.base_id)
        if base is None:
            raise MutationError(f"base skill no longer in store: {record.base_id}", status=409)
        staged = self.pending_conflicts.staged_path(conflict_id)
        if not staged.is_dir() or not (staged / "SKILL.md").is_file():
            raise MutationError("staged conflict snapshot is missing", status=409)
        new_name = name.strip() if name and name.strip() else None

        try:
            if resolution == "main":
                if new_name is not None:
                    set_skill_name(staged, new_name)
                store.update(base.package_dir, source_path=staged)
                landed = store.entry_for_dir(base.package_dir)
                assert landed is not None
                landed_id = landed.id
                result: dict[str, object] = {
                    "ok": True,
                    "id": landed.id,
                    "resolution": "main",
                    "version": landed.version,
                    "packageDir": base.package_dir,
                }
            else:
                forked_from_version = record.base_version or base.version
                if new_name is not None:
                    set_skill_name(staged, new_name)
                    declared_name = new_name
                else:
                    declared_name = parse_skill_package(
                        staged,
                        default_source=SourceDescriptor(kind="centralized", locator="centralized:fork"),
                    ).declared_name
                dest = store.ingest(
                    source_path=staged,
                    declared_name=declared_name,
                    source_kind="centralized",
                    source_locator="centralized:fork",
                    allow_duplicate_name=True,
                    desired_dir=slugify_dir(new_name) if new_name else None,
                    forked_from=record.base_id,
                    forked_from_version=forked_from_version,
                    is_primary=False,
                    history_source="fork",
                )
                fork = store.entry_for_dir(dest.name)
                assert fork is not None
                landed_id = fork.id
                result = {
                    "ok": True,
                    "id": fork.id,
                    "resolution": "fork",
                    "version": fork.version,
                    "packageDir": dest.name,
                }
        except ValueError as error:
            raise MutationError(str(error), status=409) from error

        landed_entry = store.entry_for_id(landed_id) if landed_id else None
        src = Path(record.source_path)
        if landed_entry is not None and src.is_dir() and (src / "SKILL.md").is_file():
            self._stamp_workspace_meta(src, landed_entry)
        self.pending_conflicts.remove(conflict_id)
        self.read_models.invalidate()
        return result

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

    def _stage_conflict(
        self,
        *,
        base_id: str,
        base_name: str,
        store_version: int,
        base_version: int,
        src: Path,
    ) -> dict[str, object]:
        """Snapshot a conflicting push into the central pending-conflict inbox and
        return the conflict payload (carrying its conflict_id) for the push
        response, so the project side can point the user at the manager."""
        record = self.pending_conflicts.record(
            base_id=base_id,
            base_name=base_name,
            store_version=store_version,
            base_version=base_version,
            source_path=str(src),
            workspace_id=self._workspace_id_from_path(src),
            source_package_path=src,
        )
        return {
            "conflictId": record.conflict_id,
            "id": base_id,
            "name": base_name,
            "storeVersion": store_version,
            "baseVersion": base_version,
            "sourcePath": str(src),
        }

    @staticmethod
    def _workspace_id_from_path(src: Path) -> str | None:
        """Best-effort workspace label from a `<ws>/.claude/skills/<dir>` path."""
        p = src.resolve()
        if p.parent.name == "skills" and p.parent.parent.name == ".claude":
            return str(p.parent.parent.parent)
        return None

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
                # Preserve the workspace copy's classification tags — restamping
                # must not drop them, or project-side tags vanish after a push.
                primary_tag=entry.primary_tag if entry.primary_tag else (existing.primary_tag if existing else None),
                secondary_tag=entry.secondary_tag
                if entry.secondary_tag
                else (existing.secondary_tag if existing else None),
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
