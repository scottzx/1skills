from __future__ import annotations

import unittest

from skill_manager.application.skills.manifest import SkillStoreEntry
from skill_manager.application.skills.package import fingerprint_package

from tests.support.app_harness import AppTestHarness
from tests.support.fake_home import seed_skill_package, seed_store_manifest


def seed_conflict_fixture(spec) -> None:
    """A managed 'Dup Skill' (version A) plus a divergent local copy (version B).

    The two copies share a name but differ in content, so they collide on the
    store's directory-name key — the exact situation the resolve flow targets.
    """
    managed_root = seed_skill_package(
        spec.skills_store_root,
        "dup-skill",
        "Dup Skill",
        body="version A",
        source_kind="centralized",
        source_locator="centralized:Dup Skill",
    )
    revision, _ = fingerprint_package(managed_root)
    seed_store_manifest(
        spec,
        [
            SkillStoreEntry(
                package_dir="dup-skill",
                declared_name="Dup Skill",
                source_kind="centralized",
                source_locator="centralized:Dup Skill",
                revision=revision,
            )
        ],
    )
    seed_skill_package(spec.claude_root, "dup-skill", "Dup Skill", body="version B")


class SkillsConflictTests(unittest.TestCase):
    def _dup_rows(self, harness: AppTestHarness) -> list[dict]:
        skills = harness.get_json("/api/skills")
        return [row for row in skills["rows"] if row["name"] == "Dup Skill"]

    def test_conflict_is_surfaced_on_rows(self) -> None:
        with AppTestHarness(fixture_factory=seed_conflict_fixture) as harness:
            rows = self._dup_rows(harness)
            self.assertEqual(len(rows), 2, "expected one managed + one unmanaged version")
            for row in rows:
                self.assertTrue(row["actions"]["canResolveConflict"])
                self.assertIsNotNone(row["conflict"])
                self.assertEqual(len(row["conflict"]["versions"]), 2)

    def test_resolve_keeping_managed_version_clears_conflict(self) -> None:
        with AppTestHarness(fixture_factory=seed_conflict_fixture) as harness:
            managed = next(r for r in self._dup_rows(harness) if r["displayStatus"] == "Managed")

            result = harness.post_json(
                f"/api/skills/{managed['skillRef']}/resolve-conflict",
                {"chosenRef": managed["skillRef"]},
            )
            self.assertTrue(result["ok"])

            after = self._dup_rows(harness)
            self.assertEqual(len(after), 1, "duplicates should be consolidated to one entry")
            self.assertIsNone(after[0]["conflict"])
            store_body = (harness.spec.skills_store_root / "dup-skill" / "SKILL.md").read_text()
            self.assertIn("version A", store_body)

    def test_resolve_promoting_unmanaged_version_updates_store(self) -> None:
        with AppTestHarness(fixture_factory=seed_conflict_fixture) as harness:
            rows = self._dup_rows(harness)
            managed = next(r for r in rows if r["displayStatus"] == "Managed")
            unmanaged = next(r for r in rows if r["displayStatus"] == "Unmanaged")

            result = harness.post_json(
                f"/api/skills/{managed['skillRef']}/resolve-conflict",
                {"chosenRef": unmanaged["skillRef"]},
            )
            self.assertTrue(result["ok"])

            after = self._dup_rows(harness)
            self.assertEqual(len(after), 1)
            self.assertIsNone(after[0]["conflict"])
            store_body = (harness.spec.skills_store_root / "dup-skill" / "SKILL.md").read_text()
            self.assertIn("version B", store_body)

    def test_resolve_requires_a_conflict(self) -> None:
        from tests.support.fake_home import seed_shared_only_fixture

        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            row = next(row for row in harness.get_json("/api/skills")["rows"])
            harness.post_json(
                f"/api/skills/{row['skillRef']}/resolve-conflict",
                {"chosenRef": row["skillRef"]},
                expected_status=400,
            )


if __name__ == "__main__":
    unittest.main()
