"""Pull (母体 → 项目 fast-forward) and the central pending-conflict inbox.

Exercises the two new synchronization paths through a real container so sidecar
stamping, staging snapshots, and lineage wiring are covered end to end."""

from __future__ import annotations

import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from skill_manager.application.container import build_backend_container
from skill_manager.application.skills.skillmeta import read_skill_meta

from tests.support.fake_home import create_fake_home_spec, seed_skill_package


class PullAndInboxTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.spec = create_fake_home_spec(self.root)
        env = {
            "XDG_DATA_HOME": str(self.root / "data"),
            "XDG_CONFIG_HOME": str(self.root / "config"),
            "XDG_STATE_HOME": str(self.root / "state"),
            "HOME": str(self.spec.home),
        }
        self.container = build_backend_container(env)
        self.mut = self.container.skills_mutations
        self.q = self.container.skills_queries
        self.ws = self.root / "ws" / ".claude" / "skills"
        self.ws.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self._temp.cleanup()

    def _seed(self, name: str, body: str) -> Path:
        return seed_skill_package(self.ws, name, name.title(), body=body)

    def _second_ws(self, name: str, from_dir: Path) -> Path:
        dest = self.root / "ws2" / ".claude" / "skills" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(from_dir, dest)
        return dest

    # ---- pull ------------------------------------------------------------

    def test_pull_fast_forwards_clean_copy(self) -> None:
        a = self._seed("widget", "one")
        self.mut.push_skill_from_path("shared:widget", str(a))  # v1
        # A second workspace takes v1, edits, pushes → store v2.
        b = self._second_ws("widget", a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nfrom-b", encoding="utf-8")
        self.mut.push_skill_from_path("shared:widget", str(b))  # v2

        # A is still clean at base_version 1 while the store is at v2 → pull it.
        self.assertEqual(read_skill_meta(a).base_version, 1)
        res = self.mut.pull_skill_to_path("shared:widget", str(a))
        self.assertEqual(res["status"], "pulled")
        self.assertEqual(res["version"], 2)
        self.assertEqual(read_skill_meta(a).base_version, 2)
        self.assertIn("from-b", (a / "SKILL.md").read_text())

    def test_pull_refuses_dirty_copy(self) -> None:
        a = self._seed("gadget", "one")
        self.mut.push_skill_from_path("shared:gadget", str(a))  # v1
        b = self._second_ws("gadget", a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nB", encoding="utf-8")
        self.mut.push_skill_from_path("shared:gadget", str(b))  # v2
        # Local edit on A → dirty; a fast-forward pull must refuse and not overwrite.
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nlocal-a", encoding="utf-8")
        res = self.mut.pull_skill_to_path("shared:gadget", str(a))
        self.assertEqual(res["status"], "dirty")
        self.assertIn("local-a", (a / "SKILL.md").read_text())  # untouched

    def test_pull_uptodate_when_synced(self) -> None:
        a = self._seed("thing", "one")
        self.mut.push_skill_from_path("shared:thing", str(a))  # v1, A == store
        res = self.mut.pull_skill_to_path("shared:thing", str(a))
        self.assertEqual(res["status"], "uptodate")

    def test_pull_untracked_is_noop(self) -> None:
        a = self._seed("orphan", "one")  # never pushed → not in store
        res = self.mut.pull_skill_to_path("shared:orphan", str(a))
        self.assertEqual(res["status"], "uptodate")
        self.assertEqual(res["version"], 0)

    # ---- inbox -----------------------------------------------------------

    def _make_conflict(self, name: str) -> tuple[Path, str]:
        """Drive a concurrent-edit conflict; returns (workspace copy A, skill id)."""
        a = self._seed(name, "one")
        skill_id = self.mut.push_skill_from_path(f"shared:{name}", str(a))["id"]
        b = self._second_ws(name, a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nB", encoding="utf-8")
        self.mut.push_skill_from_path(f"shared:{name}", str(b))  # store → v2
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nA", encoding="utf-8")
        res = self.mut.push_skill_from_path(f"shared:{name}", str(a))
        self.assertEqual(res["status"], "conflict")
        self.assertIn("conflictId", res["conflict"])
        return a, skill_id

    def test_conflict_is_staged_and_listed(self) -> None:
        _a, skill_id = self._make_conflict("alpha")
        listing = self.q.list_pending_conflicts()["conflicts"]
        self.assertEqual(len(listing), 1)
        item = listing[0]
        self.assertEqual(item["baseId"], skill_id)
        self.assertEqual(item["baseVersion"], 1)
        self.assertEqual(item["storeVersion"], 2)
        self.assertEqual(item["currentStoreVersion"], 2)
        self.assertTrue(item["diff"])  # per-file diff of store base vs pushed content

    def test_repeat_push_dedupes_pending(self) -> None:
        a, _ = self._make_conflict("beta")
        self.mut.push_skill_from_path("shared:beta", str(a))  # same content again
        self.assertEqual(len(self.q.list_pending_conflicts()["conflicts"]), 1)

    def test_resolve_pending_fork(self) -> None:
        _a, skill_id = self._make_conflict("gamma")
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        res = self.mut.resolve_pending_conflict(
            conflict_id=conflict_id, resolution="fork", name="Gamma Fork"
        )
        store = self.container.skills_store
        fork = store.entry_for_id(res["id"])
        self.assertEqual(res["resolution"], "fork")
        self.assertEqual(fork.forked_from, skill_id)
        self.assertFalse(fork.is_primary)
        self.assertTrue(store.entry_for_id(skill_id).is_primary)  # base still primary
        self.assertEqual(self.q.list_pending_conflicts()["conflicts"], [])  # cleared

    def test_resolve_pending_main_updates_in_place(self) -> None:
        _a, skill_id = self._make_conflict("delta")
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        res = self.mut.resolve_pending_conflict(conflict_id=conflict_id, resolution="main")
        store = self.container.skills_store
        self.assertEqual(res["id"], skill_id)  # same package, not a fork
        self.assertEqual(len(store.entries()), 1)  # in place — no new package
        self.assertEqual(store.entry_for_id(skill_id).version, 3)
        self.assertEqual(self.q.list_pending_conflicts()["conflicts"], [])

    def test_resolve_pending_dismiss_leaves_store_untouched(self) -> None:
        _a, skill_id = self._make_conflict("epsilon")
        before = self.container.skills_store.entry_for_id(skill_id).version
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        res = self.mut.resolve_pending_conflict(conflict_id=conflict_id, resolution="dismiss")
        self.assertEqual(res["resolution"], "dismiss")
        self.assertEqual(self.container.skills_store.entry_for_id(skill_id).version, before)
        self.assertEqual(self.q.list_pending_conflicts()["conflicts"], [])

    def test_resolve_survives_deleted_workspace_copy(self) -> None:
        # The staged snapshot means resolution works even if the workspace copy
        # is gone by the time the user resolves in the manager.
        a, skill_id = self._make_conflict("zeta")
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        shutil.rmtree(a)
        res = self.mut.resolve_pending_conflict(conflict_id=conflict_id, resolution="main")
        self.assertEqual(res["id"], skill_id)
        self.assertEqual(self.container.skills_store.entry_for_id(skill_id).version, 3)

    def test_tags_survive_push_restamp(self) -> None:
        # Regression: _stamp_workspace_meta must not drop classification tags.
        a = self._seed("tagged", "one")
        meta_path = a / ".skillmeta.json"
        meta_path.write_text(
            '{"id": "skl_tagged0000000001", "baseVersion": 0, "primaryTag": "ops", "secondaryTag": "sync"}',
            encoding="utf-8",
        )
        self.mut.push_skill_from_path("shared:tagged", str(a))
        stamped = read_skill_meta(a)
        self.assertEqual(stamped.primary_tag, "ops")
        self.assertEqual(stamped.secondary_tag, "sync")


if __name__ == "__main__":
    unittest.main()
