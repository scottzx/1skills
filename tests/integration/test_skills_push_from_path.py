from __future__ import annotations

from tempfile import TemporaryDirectory
import unittest
from pathlib import Path

from skill_manager.application.skills.manifest import load_skill_store_manifest
from skill_manager.application.skills.package import fingerprint_package
from skill_manager.application.skills.skillmeta import write_skill_meta, SkillMeta

from tests.support.app_harness import AppTestHarness
from tests.support.fake_home import seed_shared_only_fixture, seed_skill_package


def _manifest_revision(harness: AppTestHarness, package_dir: str) -> str:
    manifest = load_skill_store_manifest(harness.spec.skills_store_root.parent / "manifest.json")
    return next(entry.revision for entry in manifest.entries if entry.package_dir == package_dir)


def _stamp_workspace_meta(harness: AppTestHarness, package_dir: Path, package_name: str, base_version: int = 1) -> None:
    manifest = load_skill_store_manifest(harness.spec.skills_store_root.parent / "manifest.json")
    entry = next(e for e in manifest.entries if e.package_dir == package_name)
    write_skill_meta(package_dir, SkillMeta(id=entry.id, base_version=base_version))


def _adopt_pending(harness: AppTestHarness, result: dict) -> dict:
    """Resolve a project push that was staged into the pending inbox."""
    assert result["status"] == "pending", result
    pending_id = result["pending"]["id"]
    return harness.post_json(
        "/api/skills/pending-conflicts/resolve",
        {"conflictId": pending_id, "resolution": "main"},
    )


class SkillsPushFromPathTests(unittest.TestCase):
    """Project push stages only; store writes require Skills Manager resolve."""

    def _shared_ref(self, harness: AppTestHarness) -> str:
        skills = harness.get_json("/api/skills")
        return next(row["skillRef"] for row in skills["rows"] if row["name"] == "Shared Audit")

    def test_push_modified_copy_stages_without_writing_store(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            before = _manifest_revision(harness, "shared-audit")

            with TemporaryDirectory() as work_dir:
                edited = seed_skill_package(
                    Path(work_dir),
                    "shared-audit",
                    "Shared Audit",
                    body="edited in the workspace",
                    support_files={"assets/new.txt": "brand new file"},
                )
                _stamp_workspace_meta(harness, edited, "shared-audit", base_version=1)
                result = harness.post_json(
                    f"/api/skills/{ref}/push-from-path",
                    {"sourcePath": str(edited)},
                )

            self.assertEqual(result["ok"], True)
            self.assertEqual(result["status"], "pending")
            self.assertEqual(result["pending"]["kind"], "update")
            self.assertEqual(result["changed"], False)
            store_pkg = harness.spec.skills_store_root / "shared-audit"
            self.assertNotIn("edited in the workspace", (store_pkg / "SKILL.md").read_text(encoding="utf-8"))
            self.assertEqual(before, _manifest_revision(harness, "shared-audit"))

            adopted = _adopt_pending(harness, result)
            self.assertEqual(adopted["ok"], True)
            self.assertEqual(adopted["version"], 2)
            self.assertIn("edited in the workspace", (store_pkg / "SKILL.md").read_text(encoding="utf-8"))
            self.assertTrue((store_pkg / "assets" / "new.txt").is_file())
            after = _manifest_revision(harness, "shared-audit")
            self.assertNotEqual(before, after)
            self.assertEqual(after, fingerprint_package(store_pkg)[0])

    def test_repeated_content_changes_bump_version_on_adopt(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            for expected_version, body in ((2, "first edit"), (3, "second edit")):
                with TemporaryDirectory() as work_dir:
                    edited = seed_skill_package(
                        Path(work_dir), "shared-audit", "Shared Audit", body=body
                    )
                    _stamp_workspace_meta(harness, edited, "shared-audit", base_version=expected_version - 1)
                    result = harness.post_json(
                        f"/api/skills/{ref}/push-from-path", {"sourcePath": str(edited)}
                    )
                self.assertEqual(result["status"], "pending")
                adopted = _adopt_pending(harness, result)
                self.assertEqual(adopted["ok"], True)
                self.assertEqual(adopted["version"], expected_version)

    def test_push_identical_copy_is_noop(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            ref = self._shared_ref(harness)
            before = _manifest_revision(harness, "shared-audit")

            result = harness.post_json(
                f"/api/skills/{ref}/push-from-path",
                {"sourcePath": str(harness.spec.skills_store_root / "shared-audit")},
            )

            self.assertEqual(result["ok"], True)
            self.assertEqual(result["status"], "exists")
            self.assertEqual(result["changed"], False)
            self.assertEqual(result["created"], False)
            self.assertEqual(result["version"], 1)
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

    def test_push_local_only_skill_stages_create(self) -> None:
        with AppTestHarness(fixture_factory=seed_shared_only_fixture) as harness:
            self.assertFalse((harness.spec.skills_store_root / "custom-kit").exists())
            with TemporaryDirectory() as work_dir:
                custom = seed_skill_package(
                    Path(work_dir), "custom-kit", "Custom Kit", body="hand-written", description="my own skill"
                )
                result = harness.post_json(
                    "/api/skills/shared:custom-kit/push-from-path", {"sourcePath": str(custom)}
                )
            self.assertEqual(result["ok"], True)
            self.assertEqual(result["status"], "pending")
            self.assertEqual(result["pending"]["kind"], "create")
            self.assertFalse((harness.spec.skills_store_root / "custom-kit").exists())
            rows = harness.get_json("/api/skills")["rows"]
            self.assertFalse(any(r["name"] == "Custom Kit" for r in rows))

            adopted = _adopt_pending(harness, result)
            self.assertEqual(adopted["ok"], True)
            self.assertEqual(adopted["version"], 1)
            store_pkg = harness.spec.skills_store_root / adopted["packageDir"]
            self.assertTrue((store_pkg / "SKILL.md").is_file())
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
                    Path(work_dir), "shared-audit", "Shared Audit", body="drifted body"
                )
                status = harness.post_json(
                    f"/api/skills/{ref}/status-from-path", {"sourcePath": str(edited)}
                )
            self.assertEqual(status["inStore"], True)
            self.assertEqual(status["differs"], True)
