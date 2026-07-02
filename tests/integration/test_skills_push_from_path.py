from __future__ import annotations

from tempfile import TemporaryDirectory
import unittest
from pathlib import Path

from skill_manager.application.skills.manifest import load_skill_store_manifest
from skill_manager.application.skills.package import fingerprint_package

from tests.support.app_harness import AppTestHarness
from tests.support.fake_home import seed_shared_only_fixture, seed_skill_package


def _manifest_revision(harness: AppTestHarness, package_dir: str) -> str:
    manifest = load_skill_store_manifest(harness.spec.skills_store_root.parent / "manifest.json")
    return next(entry.revision for entry in manifest.entries if entry.package_dir == package_dir)


class SkillsPushFromPathTests(unittest.TestCase):
    """Reverse-sync: a workspace's edited copy is pushed back to overwrite the
    shared-store baseline (母体). Mirrors the create-time weak-copy."""

    def _shared_ref(self, harness: AppTestHarness) -> str:
        skills = harness.get_json("/api/skills")
        return next(row["skillRef"] for row in skills["rows"] if row["name"] == "Shared Audit")

    def test_push_modified_copy_overwrites_store_and_bumps_revision(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            before = _manifest_revision(harness, "shared-audit")

            with TemporaryDirectory() as work_dir:
                # A workspace's own copy that has drifted from the store.
                edited = seed_skill_package(
                    Path(work_dir),
                    "shared-audit",
                    "Shared Audit",
                    body="edited in the workspace",
                    support_files={"assets/new.txt": "brand new file"},
                )
                result = harness.post_json(
                    f"/api/skills/{ref}/push-from-path",
                    {"sourcePath": str(edited)},
                )

            self.assertEqual(result, {"ok": True, "changed": True, "created": False, "version": 2})
            store_pkg = harness.spec.skills_store_root / "shared-audit"
            self.assertIn("edited in the workspace", (store_pkg / "SKILL.md").read_text(encoding="utf-8"))
            self.assertTrue((store_pkg / "assets" / "new.txt").is_file())
            after = _manifest_revision(harness, "shared-audit")
            self.assertNotEqual(before, after)
            self.assertEqual(after, fingerprint_package(store_pkg)[0])

    def test_repeated_content_changes_bump_version_monotonically(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            for expected_version, body in ((2, "first edit"), (3, "second edit")):
                with TemporaryDirectory() as work_dir:
                    edited = seed_skill_package(
                        Path(work_dir), "shared-audit", "Shared Audit", body=body
                    )
                    result = harness.post_json(
                        f"/api/skills/{ref}/push-from-path", {"sourcePath": str(edited)}
                    )
                self.assertEqual(result, {"ok": True, "changed": True, "created": False, "version": expected_version})

    def test_push_identical_copy_is_noop(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            before = _manifest_revision(harness, "shared-audit")

            result = harness.post_json(
                f"/api/skills/{ref}/push-from-path",
                {"sourcePath": str(harness.spec.skills_store_root / "shared-audit")},
            )

            self.assertEqual(result, {"ok": True, "changed": False, "created": False, "version": 1})
            self.assertEqual(before, _manifest_revision(harness, "shared-audit"))

    def test_push_rejects_source_without_skill_md(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            with TemporaryDirectory() as work_dir:
                empty = Path(work_dir) / "shared-audit"
                empty.mkdir()
                result = harness.post_json(
                    f"/api/skills/{ref}/push-from-path",
                    {"sourcePath": str(empty)},
                    expected_status=400,
                )
            self.assertIn("SKILL.md", result["error"])

    def test_push_local_only_skill_ingests_into_store(self) -> None:
        # A custom skill the user dropped into a workspace, absent from the store.
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            self.assertFalse((harness.spec.skills_store_root / "custom-kit").exists())
            with TemporaryDirectory() as work_dir:
                custom = seed_skill_package(
                    Path(work_dir), "custom-kit", "Custom Kit", body="hand-written", description="my own skill"
                )
                result = harness.post_json(
                    "/api/skills/shared:custom-kit/push-from-path", {"sourcePath": str(custom)}
                )
            self.assertEqual(result, {"ok": True, "changed": True, "created": True, "version": 1})
            store_pkg = harness.spec.skills_store_root / "custom-kit"
            self.assertTrue((store_pkg / "SKILL.md").is_file())
            # Now it is managed in the store inventory.
            rows = harness.get_json("/api/skills")["rows"]
            self.assertTrue(any(r["name"] == "Custom Kit" for r in rows))


class SkillStatusFromPathTests(unittest.TestCase):
    def _shared_ref(self, harness: AppTestHarness) -> str:
        skills = harness.get_json("/api/skills")
        return next(row["skillRef"] for row in skills["rows"] if row["name"] == "Shared Audit")

    def test_status_reports_modified_synced_and_frontmatter(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            store_pkg = str(harness.spec.skills_store_root / "shared-audit")

            same = harness.post_json(f"/api/skills/{ref}/status-from-path", {"sourcePath": store_pkg})
            self.assertEqual(same["inStore"], True)
            self.assertEqual(same["differs"], False)
            self.assertEqual(same["name"], "Shared Audit")
            self.assertEqual(same["storeVersion"], 1)

            with TemporaryDirectory() as work_dir:
                edited = seed_skill_package(
                    Path(work_dir), "shared-audit", "Shared Audit", body="changed", description="edited desc"
                )
                diff = harness.post_json(f"/api/skills/{ref}/status-from-path", {"sourcePath": str(edited)})
            self.assertEqual(diff["inStore"], True)
            self.assertEqual(diff["differs"], True)
            self.assertEqual(diff["description"], "edited desc")

    def test_status_reports_local_only_for_custom_skill(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            with TemporaryDirectory() as work_dir:
                custom = seed_skill_package(
                    Path(work_dir), "custom-kit", "Custom Kit", description="not in store"
                )
                result = harness.post_json(
                    "/api/skills/shared:custom-kit/status-from-path", {"sourcePath": str(custom)}
                )
            # Not in the store → inStore False, differs True (push would create it).
            self.assertEqual(result["inStore"], False)
            self.assertEqual(result["differs"], True)
            self.assertEqual(result["exists"], True)
            self.assertEqual(result["name"], "Custom Kit")
            self.assertEqual(result["description"], "not in store")

    def test_status_reports_not_exists_for_missing_path(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            result = harness.post_json(f"/api/skills/{ref}/status-from-path", {"sourcePath": "/nope/missing"})
            self.assertEqual(result["exists"], False)


if __name__ == "__main__":
    unittest.main()
