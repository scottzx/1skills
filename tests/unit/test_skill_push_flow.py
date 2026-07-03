"""End-to-end push decision tree via the mutation service (Issue #379).

Drives the four push branches (created / updated / concurrent-conflict / dedup)
and conflict resolution (fork / main) through a real container so the sidecar
stamping and lineage wiring are exercised together."""

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

    def test_full_decision_tree(self) -> None:
        # 1. First push of a custom copy → created + id assigned + sidecar stamped.
        a = self._seed("audit", "one")
        r1 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r1["status"], "created")
        skill_id = r1["id"]
        self.assertEqual(read_skill_meta(a).id, skill_id)
        self.assertEqual(read_skill_meta(a).base_version, 1)

        # 2. Edit + push same copy → linear update to v2.
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nmore", encoding="utf-8")
        r2 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r2["status"], "updated")
        self.assertEqual(r2["version"], 2)
        self.assertEqual(read_skill_meta(a).base_version, 2)

        # 3. A second workspace copy taken at v2, edited + pushed → v3.
        b = self.root / "ws2" / ".claude" / "skills" / "audit"
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(a, b)
        (b / "SKILL.md").write_text((b / "SKILL.md").read_text() + "\nfrom-b", encoding="utf-8")
        r3 = self.mut.push_skill_from_path("shared:audit", str(b))
        self.assertEqual(r3["status"], "updated")
        self.assertEqual(r3["version"], 3)

        # 4. Now the original copy A (still baseVersion 2) edits + pushes →
        #    concurrent edit → conflict, store untouched.
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\nfrom-a", encoding="utf-8")
        r4 = self.mut.push_skill_from_path("shared:audit", str(a))
        self.assertEqual(r4["status"], "conflict")
        self.assertEqual(r4["conflict"]["baseVersion"], 2)
        self.assertEqual(r4["conflict"]["storeVersion"], 3)

        # 5. Resolve as fork → new package, original still primary.
        r5 = self.mut.resolve_push_conflict(
            source_path=str(a), base_id=skill_id, resolution="fork", name="Audit A"
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

    def test_dedup_identical_content_reports_exists(self) -> None:
        a = self._seed("dedupe", "same")
        r1 = self.mut.push_skill_from_path("shared:dedupe", str(a))
        skill_id = r1["id"]
        # A fresh copy with identical content but no sidecar id.
        c = self.root / "elsewhere" / "dedupe"
        c.parent.mkdir(parents=True, exist_ok=True)
        seed_skill_package(c.parent, "dedupe", "Dedupe", body="same")
        r2 = self.mut.push_skill_from_path("shared:dedupe", str(c))
        self.assertEqual(r2["status"], "exists")
        self.assertEqual(r2["id"], skill_id)
        self.assertEqual(read_skill_meta(c).id, skill_id)

    def test_rename_then_push_resolves_by_stable_id(self) -> None:
        # Push a copy → gets id + sidecar. Rename the workspace dir AND the
        # SKILL.md name, then push the renamed copy: it must key off the sidecar
        # id and land as a linear update on the SAME package, not a new one.
        a = self._seed("renamer", "one")
        skill_id = self.mut.push_skill_from_path("shared:renamer", str(a))["id"]
        renamed = a.parent / "renamed-dir"
        a.rename(renamed)
        (renamed / "SKILL.md").write_text("---\nname: Totally Renamed\n---\n\n# Totally Renamed\n\nedited", encoding="utf-8")
        r = self.mut.push_skill_from_path("shared:renamed-dir", str(renamed))
        self.assertEqual(r["status"], "updated")
        self.assertEqual(r["id"], skill_id)
        self.assertEqual(len(self.container.skills_store.entries()), 1)

    def test_restore_via_service(self) -> None:
        a = self._seed("hist", "one")
        skill_id = self.mut.push_skill_from_path("shared:hist", str(a))["id"]
        (a / "SKILL.md").write_text((a / "SKILL.md").read_text() + "\ntwo", encoding="utf-8")
        self.mut.push_skill_from_path("shared:hist", str(a))
        res = self.mut.restore_skill_version(skill_id, 1)
        self.assertEqual(res["version"], 3)
        versions = self.container.skills_queries.list_skill_versions(skill_id)
        self.assertEqual(versions["currentVersion"], 3)
        self.assertEqual({v["version"] for v in versions["versions"]}, {1, 2, 3})


if __name__ == "__main__":
    unittest.main()
