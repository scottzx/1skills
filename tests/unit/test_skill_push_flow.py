"""End-to-end push decision tree via the mutation service.

Project push only *stages* content. Adoption into the shared store happens via
Skills Manager resolve_pending_conflict (main / fork / dismiss).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from skill_manager.application.container import build_backend_container
from skill_manager.application.skills.skillmeta import read_skill_meta

from tests.support.fake_home import create_fake_home_spec, seed_skill_package


class PushFlowTests(unittest.TestCase):
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
        self.ws = self.root / "ws" / ".claude" / "skills"
        self.ws.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self._temp.cleanup()

    def _seed(self, name: str, body: str) -> Path:
        return seed_skill_package(self.ws, name, name.title(), body=body)

    def _push_and_adopt(self, skill_ref: str, path: Path, *, resolution: str = "main", name: str | None = None) -> dict:
        res = self.mut.push_skill_from_path(skill_ref, str(path))
        if res["status"] == "exists":
            return res
        self.assertEqual(res["status"], "pending", res)
        pending_id = res["pending"]["id"]
        adopted = self.mut.resolve_pending_conflict(
            conflict_id=pending_id, resolution=resolution, name=name
        )
        return {
            **res,
            "id": adopted.get("id"),
            "version": adopted.get("version"),
            "status": "adopted",
            "adopted": adopted,
        }

    def test_full_decision_tree(self) -> None:
        # 1. First push stages create → manager adopts → id assigned + sidecar stamped.
        a = self._seed("audit", "one")
        r1 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r1["status"], "pending")
        self.assertEqual(r1["pending"]["kind"], "create")
        skill_id = self.mut.resolve_pending_conflict(
            conflict_id=r1["pending"]["id"], resolution="main"
        )["id"]
        self.assertEqual(read_skill_meta(a).id, skill_id)
        self.assertEqual(read_skill_meta(a).base_version, 1)

        # 2. Edit + push same copy → stages update; adopt → v2.
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nmore", encoding="utf-8")
        r2 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r2["status"], "pending")
        self.assertEqual(r2["pending"]["kind"], "update")
        r2a = self.mut.resolve_pending_conflict(conflict_id=r2["pending"]["id"], resolution="main")
        self.assertEqual(r2a["version"], 2)
        self.assertEqual(read_skill_meta(a).base_version, 2)

        # 3. Second workspace at v2 edits + pushes → adopt → v3.
        b = self.root / "ws2" / ".claude" / "skills" / "audit"
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(a, b)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nfrom-b", encoding="utf-8")
        r3 = self._push_and_adopt("shared:audit", b)
        self.assertEqual(r3["version"], 3)

        # 4. Original A (baseVersion 2) edits + pushes → concurrent conflict pending.
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nfrom-a", encoding="utf-8")
        r4 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r4["status"], "pending")
        self.assertEqual(r4["pending"]["kind"], "conflict")
        self.assertEqual(r4["conflict"]["baseVersion"], 2)
        self.assertEqual(r4["conflict"]["storeVersion"], 3)

        # 5. Resolve as fork → new package, original still primary.
        r5 = self.mut.resolve_pending_conflict(
            conflict_id=r4["pending"]["id"], resolution="fork", name="Audit A"
        )
        fork_id = r5["id"]
        self.assertNotEqual(fork_id, skill_id)
        store = self.container.skills_store
        self.assertTrue(store.entry_for_id(skill_id).is_primary)
        self.assertFalse(store.entry_for_id(fork_id).is_primary)
        self.assertEqual(store.entry_for_id(fork_id).forked_from, skill_id)
        self.assertEqual(store.entry_for_id(fork_id).forked_from_version, 2)

        # 6. Promote the fork to main → original demoted.
        self.mut.promote_skill(fork_id)
        self.assertTrue(store.entry_for_id(fork_id).is_primary)
        self.assertFalse(store.entry_for_id(skill_id).is_primary)

    def test_resolve_main_updates_base_in_place(self) -> None:
        a = self._seed("gadget", "one")
        skill_id = self._push_and_adopt("shared:gadget", a)["id"]
        b = self.root / "ws2" / ".claude" / "skills" / "gadget"
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(a, b)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nB", encoding="utf-8")
        self._push_and_adopt("shared:gadget", b)  # store → v2
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nA", encoding="utf-8")
        pending = self.mut.push_skill_from_path("shared:gadget", str(a))
        self.assertEqual(pending["status"], "pending")
        self.assertEqual(pending["pending"]["kind"], "conflict")

        res = self.mut.resolve_pending_conflict(
            conflict_id=pending["pending"]["id"], resolution="main"
        )
        store = self.container.skills_store
        self.assertEqual(res["resolution"], "main")
        self.assertEqual(res["id"], skill_id)
        self.assertEqual(len(store.entries()), 1)
        self.assertEqual(store.entry_for_id(skill_id).version, 3)
        versions = self.container.skills_queries.list_skill_versions(skill_id)["versions"]
        self.assertEqual({v["version"] for v in versions}, {1, 2, 3})

    def test_legacy_divergent_push_conflicts(self) -> None:
        a = self._seed("widget", "original")
        skill_id = self._push_and_adopt("shared:widget", a)["id"]
        legacy = self.root / "legacy" / "widget"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        seed_skill_package(legacy.parent, "widget", "Widget", body="divergent, no sidecar")
        r = self.mut.push_skill_from_path("shared:widget", str(legacy))
        self.assertEqual(r["status"], "pending")
        self.assertEqual(r["pending"]["kind"], "conflict")
        self.assertEqual(r["conflict"]["id"], skill_id)
        self.assertEqual(len(self.container.skills_store.entries()), 1)

    def test_dedup_identical_content_reports_exists(self) -> None:
        a = self._seed("dedupe", "same")
        r1 = self._push_and_adopt("shared:dedupe", a)
        skill_id = r1["id"]
        c = self.root / "elsewhere" / "dedupe"
        c.parent.mkdir(parents=True, exist_ok=True)
        seed_skill_package(c.parent, "dedupe", "Dedupe", body="same")
        r2 = self.mut.push_skill_from_path("shared:dedupe", str(c))
        self.assertEqual(r2["status"], "exists")
        self.assertEqual(r2["id"], skill_id)
        self.assertEqual(read_skill_meta(c).id, skill_id)

    def test_rename_then_push_resolves_by_stable_id(self) -> None:
        a = self._seed("renamer", "one")
        skill_id = self._push_and_adopt("shared:renamer", a)["id"]
        renamed = a.parent / "renamed-dir"
        a.rename(renamed)
        (renamed / "SKILL.md").write_text(
            "---\nname: Totally Renamed\n---\n\n# Totally Renamed\n\nedited", encoding="utf-8"
        )
        r = self.mut.push_skill_from_path("shared:renamed-dir", str(renamed))
        self.assertEqual(r["status"], "pending")
        self.assertEqual(r["pending"]["kind"], "update")
        self.assertEqual(r["id"], skill_id)
        adopted = self.mut.resolve_pending_conflict(
            conflict_id=r["pending"]["id"], resolution="main"
        )
        self.assertEqual(adopted["id"], skill_id)
        self.assertEqual(len(self.container.skills_store.entries()), 1)

    def test_preview_and_version_diff(self) -> None:
        a = self._seed("diffy", "alpha")
        skill_id = self._push_and_adopt("shared:diffy", a)["id"]
        (a / "SKILL.md").write_text(
            (a / "SKILL.md").read_text().replace("alpha", "beta"), encoding="utf-8"
        )
        self._push_and_adopt("shared:diffy", a)  # v2
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\npending", encoding="utf-8")
        prev = self.container.skills_queries.preview_push_from_path("shared:diffy", str(a))
        self.assertFalse(prev["isNew"])
        self.assertEqual(prev["target"]["id"], skill_id)
        self.assertIn("pending", prev["files"][0]["diff"])
        vd = self.container.skills_queries.diff_skill_versions(skill_id, 1, 2)
        self.assertEqual(vd["from"], 1)
        self.assertEqual(vd["to"], 2)
        joined = vd["files"][0]["diff"]
        self.assertIn("-", joined)
        self.assertTrue(any("beta" in line for line in joined.splitlines()))

    def test_restore_via_service(self) -> None:
        a = self._seed("hist", "one")
        skill_id = self._push_and_adopt("shared:hist", a)["id"]
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\ntwo", encoding="utf-8")
        self._push_and_adopt("shared:hist", a)
        res = self.mut.restore_skill_version(skill_id, 1)
        self.assertEqual(res["version"], 3)
        versions = self.container.skills_queries.list_skill_versions(skill_id)
        self.assertEqual(versions["currentVersion"], 3)
        self.assertEqual({v["version"] for v in versions["versions"]}, {1, 2, 3})


if __name__ == "__main__":
    unittest.main()
