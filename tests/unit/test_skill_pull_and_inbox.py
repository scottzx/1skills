"""Pull (母体 → 项目 fast-forward) and the central pending-push inbox.

Exercises the two synchronization paths through a real container so sidecar
stamping, staging snapshots, and lineage wiring are covered end to end.

Project push only stages; Skills Manager resolve adopts into the shared store.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from skill_manager.application.container import build_backend_container
from skill_manager.application.skills.skillmeta import read_skill_meta
from skill_manager.errors import MutationError

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

    def _push_and_adopt(self, skill_ref: str, path: Path) -> dict:
        """Project push stages only; adopt via manager resolve (main)."""
        res = self.mut.push_skill_from_path(skill_ref, str(path))
        if res["status"] == "exists":
            return res
        self.assertEqual(res["status"], "pending")
        pending_id = res["pending"]["id"]
        adopted = self.mut.resolve_pending_conflict(conflict_id=pending_id, resolution="main")
        return {**res, "id": adopted["id"], "version": adopted["version"], "adopted": adopted}

    # ---- pull ------------------------------------------------------------

    def test_pull_fast_forwards_clean_copy(self) -> None:
        a = self._seed("widget", "one")
        self._push_and_adopt("shared:widget", a)  # v1
        b = self._second_ws("widget", a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nfrom-b", encoding="utf-8")
        self._push_and_adopt("shared:widget", b)  # v2

        self.assertEqual(read_skill_meta(a).base_version, 1)
        res = self.mut.pull_skill_to_path("shared:widget", str(a))
        self.assertEqual(res["status"], "pulled")
        self.assertEqual(res["version"], 2)
        self.assertEqual(read_skill_meta(a).base_version, 2)
        self.assertIn("from-b", (a / "SKILL.md").read_text())

    def test_pull_refuses_dirty_copy(self) -> None:
        a = self._seed("gadget", "one")
        self._push_and_adopt("shared:gadget", a)  # v1
        b = self._second_ws("gadget", a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nB", encoding="utf-8")
        self._push_and_adopt("shared:gadget", b)  # v2
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nlocal-a", encoding="utf-8")
        res = self.mut.pull_skill_to_path("shared:gadget", str(a))
        self.assertEqual(res["status"], "dirty")
        self.assertIn("local-a", (a / "SKILL.md").read_text())

    def test_pull_uptodate_when_synced(self) -> None:
        a = self._seed("thing", "one")
        self._push_and_adopt("shared:thing", a)
        res = self.mut.pull_skill_to_path("shared:thing", str(a))
        self.assertEqual(res["status"], "uptodate")

    def test_pull_untracked_is_noop(self) -> None:
        a = self._seed("orphan", "one")
        res = self.mut.pull_skill_to_path("shared:orphan", str(a))
        self.assertEqual(res["status"], "uptodate")
        self.assertEqual(res["version"], 0)

    def test_pull_tracks_untracked_identical_copy(self) -> None:
        a = self._seed("uikit", "one")
        self._push_and_adopt("shared:uikit", a)
        c = self.root / "ws3" / ".claude" / "skills" / "uikit"
        c.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(a, c)
        (c / ".skillmeta.json").unlink(missing_ok=True)
        self.assertIsNone(read_skill_meta(c))
        res = self.mut.pull_skill_to_path("shared:uikit", str(c))
        self.assertEqual(res["status"], "pulled")
        self.assertEqual(read_skill_meta(c).base_version, 1)
        self.assertEqual(self.mut.pull_skill_to_path("shared:uikit", str(c))["status"], "uptodate")

    # ---- inbox -----------------------------------------------------------

    def _make_conflict(self, name: str) -> tuple[Path, str]:
        a = self._seed(name, "one")
        skill_id = self._push_and_adopt(f"shared:{name}", a)["id"]
        b = self._second_ws(name, a)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nB", encoding="utf-8")
        self._push_and_adopt(f"shared:{name}", b)  # store → v2
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nA", encoding="utf-8")
        res = self.mut.push_skill_from_path(f"shared:{name}", str(a))
        self.assertEqual(res["status"], "pending")
        self.assertEqual(res["pending"]["kind"], "conflict")
        self.assertIn("conflictId", res["conflict"])
        return a, skill_id

    def test_create_is_staged_not_ingested(self) -> None:
        a = self._seed("newbie", "brand new")
        res = self.mut.push_skill_from_path("shared:newbie", str(a))
        self.assertEqual(res["status"], "pending")
        self.assertEqual(res["pending"]["kind"], "create")
        self.assertFalse((self.container.skills_store.root / "newbie").exists())
        listing = self.q.list_pending_conflicts()["conflicts"]
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]["kind"], "create")
        adopted = self.mut.resolve_pending_conflict(
            conflict_id=res["pending"]["id"], resolution="main"
        )
        self.assertTrue((self.container.skills_store.root / adopted["packageDir"]).is_dir())
        self.assertEqual(self.q.list_pending_conflicts()["conflicts"], [])

    def test_linear_update_is_staged_not_written(self) -> None:
        a = self._seed("linear", "one")
        skill_id = self._push_and_adopt("shared:linear", a)["id"]
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nedit", encoding="utf-8")
        res = self.mut.push_skill_from_path("shared:linear", str(a))
        self.assertEqual(res["status"], "pending")
        self.assertEqual(res["pending"]["kind"], "update")
        self.assertEqual(self.container.skills_store.entry_for_id(skill_id).version, 1)
        with self.assertRaises(MutationError):
            self.mut.resolve_pending_conflict(
                conflict_id=res["pending"]["id"], resolution="fork"
            )
        adopted = self.mut.resolve_pending_conflict(
            conflict_id=res["pending"]["id"], resolution="main"
        )
        self.assertEqual(adopted["id"], skill_id)
        self.assertEqual(self.container.skills_store.entry_for_id(skill_id).version, 2)

    def test_conflict_is_staged_and_listed(self) -> None:
        _a, skill_id = self._make_conflict("alpha")
        listing = self.q.list_pending_conflicts()["conflicts"]
        self.assertEqual(len(listing), 1)
        item = listing[0]
        self.assertEqual(item["kind"], "conflict")
        self.assertEqual(item["baseId"], skill_id)
        self.assertEqual(item["baseVersion"], 1)
        self.assertEqual(item["storeVersion"], 2)
        self.assertEqual(item["currentStoreVersion"], 2)
        self.assertTrue(item["diff"])

    def test_repeat_push_dedupes_pending(self) -> None:
        a, _ = self._make_conflict("beta")
        self.mut.push_skill_from_path("shared:beta", str(a))
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
        self.assertTrue(store.entry_for_id(skill_id).is_primary)
        self.assertEqual(self.q.list_pending_conflicts()["conflicts"], [])

    def test_resolve_pending_main_updates_in_place(self) -> None:
        _a, skill_id = self._make_conflict("delta")
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        res = self.mut.resolve_pending_conflict(conflict_id=conflict_id, resolution="main")
        store = self.container.skills_store
        self.assertEqual(res["id"], skill_id)
        self.assertEqual(len(store.entries()), 1)
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
        a, skill_id = self._make_conflict("zeta")
        conflict_id = self.q.list_pending_conflicts()["conflicts"][0]["conflictId"]
        shutil.rmtree(a)
        res = self.mut.resolve_pending_conflict(conflict_id=conflict_id, resolution="main")
        self.assertEqual(res["id"], skill_id)
        self.assertEqual(self.container.skills_store.entry_for_id(skill_id).version, 3)

    def test_tags_survive_push_restamp(self) -> None:
        a = self._seed("tagged", "one")
        meta_path = a / ".skillmeta.json"
        meta_path.write_text(
            '{"id": "skl_tagged0000000001", "baseVersion": 0, "primaryTag": "ops", "secondaryTag": "sync"}',
            encoding="utf-8",
        )
        self._push_and_adopt("shared:tagged", a)
        stamped = read_skill_meta(a)
        self.assertEqual(stamped.primary_tag, "ops")
        self.assertEqual(stamped.secondary_tag, "sync")


if __name__ == "__main__":
    unittest.main()
