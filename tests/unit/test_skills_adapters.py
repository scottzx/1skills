from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from skill_manager.application.skills.adapters import build_skills_adapters
from skill_manager.errors import MutationError
from skill_manager.harness import HarnessKernelService, HarnessSupportStore

from tests.support.fake_home import create_fake_home_spec, seed_skill_package


def _adapter(harness: str, spec) :
    kernel = HarnessKernelService.from_environment(
        spec.env(),
        support_store=HarnessSupportStore(spec.root / "settings.json"),
    )
    return next(adapter for adapter in build_skills_adapters(kernel) if adapter.harness == harness)


class SkillsAdapterTests(unittest.TestCase):
    def test_adapter_scans_discovery_roots_and_reports_installation(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            seed_skill_package(spec.codex_legacy_root, "trace-lens", "Trace Lens")
            seed_skill_package(spec.openclaw_managed_root, "watch", "Workspace Watch")
            seed_skill_package(spec.grok_root, "commit", "Commit")

            codex = _adapter("codex", spec)
            claude = _adapter("claude", spec)
            openclaw = _adapter("openclaw", spec)
            grok = _adapter("grok", spec)

            codex_scan = codex.scan()
            claude_scan = claude.scan()
            openclaw_scan = openclaw.scan()
            grok_scan = grok.scan()

            self.assertTrue(codex_scan.installed)
            self.assertEqual(codex_scan.skills[0].package.declared_name, "Trace Lens")
            self.assertTrue(claude_scan.installed)
            self.assertEqual(claude_scan.skills, ())
            self.assertTrue(openclaw_scan.installed)
            self.assertEqual(
                [skill.package.declared_name for skill in openclaw_scan.skills],
                ["Workspace Watch"],
            )
            self.assertTrue(grok_scan.installed)
            self.assertEqual(grok.managed_root, spec.grok_root)
            self.assertEqual(
                [skill.package.declared_name for skill in grok_scan.skills],
                ["Commit"],
            )

    def test_adapter_reports_missing_cli_as_not_installed(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir), seed_openclaw_state=False)

            openclaw = _adapter("openclaw", spec)

            self.assertFalse(openclaw.status().installed)
            self.assertEqual(openclaw.scan().skills, ())

    def test_cursor_skills_use_skills_root_and_ignore_skills_cursor(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            seed_skill_package(spec.cursor_root, "managed-cursor", "Managed Cursor")
            seed_skill_package(spec.cursor_owned_root, "cursor-built", "Cursor Built")

            cursor = _adapter("cursor", spec)
            scan = cursor.scan()

            self.assertEqual(cursor.managed_root, spec.cursor_root)
            self.assertEqual(
                [skill.package.declared_name for skill in scan.skills],
                ["Managed Cursor"],
            )

    def test_cursor_app_probe_keeps_skills_adapter_installed_without_cli(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            (spec.bin_dir / "cursor-agent").unlink()
            (spec.home / "Applications" / "Cursor.app").mkdir(parents=True)

            cursor = _adapter("cursor", spec)
            kernel = HarnessKernelService.from_environment(
                spec.env(),
                support_store=HarnessSupportStore(spec.root / "settings.json"),
            )
            cursor_status = next(
                status for status in kernel.harness_statuses() if status.harness == "cursor"
            )

            self.assertTrue(cursor.status().installed)
            self.assertTrue(cursor_status.installed)
            self.assertEqual(cursor_status.managed_location, spec.cursor_root)

    def test_enable_copies_directory(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            package = seed_skill_package(spec.skills_store_root, "audit", "Audit")
            codex = _adapter("codex", spec)

            codex.enable_shared_package(package)

            link = spec.codex_root / "audit"
            self.assertTrue(link.is_dir())
            self.assertFalse(link.is_symlink())
            self.assertEqual((link / "SKILL.md").read_text(), (package / "SKILL.md").read_text())

    def test_enable_refuses_real_directory(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            package = seed_skill_package(spec.skills_store_root, "audit", "Audit")
            seed_skill_package(spec.codex_root, "audit", "Local Audit")
            codex = _adapter("codex", spec)

            with self.assertRaises(MutationError) as ctx:
                codex.enable_shared_package(package)

            self.assertIn("already exists", str(ctx.exception))

    def test_adopt_local_copy_copies_directory(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            store_pkg = seed_skill_package(spec.skills_store_root, "audit", "Audit", body="store body")
            harness_pkg = seed_skill_package(spec.codex_root, "audit", "Audit", body="local body")
            codex = _adapter("codex", spec)

            codex.adopt_local_copy(harness_pkg, store_pkg)

            self.assertTrue(harness_pkg.is_dir())
            self.assertFalse(harness_pkg.is_symlink())
            self.assertIn("store body", (harness_pkg / "SKILL.md").read_text())

    def test_materialize_binding_is_noop(self) -> None:
        with TemporaryDirectory() as temp_dir:
            spec = create_fake_home_spec(Path(temp_dir))
            store_pkg = seed_skill_package(
                spec.skills_store_root,
                "audit",
                "Audit",
                body="shared version",
            )
            link = seed_skill_package(spec.codex_root, "audit", "Audit", body="harness version")
            codex = _adapter("codex", spec)

            codex.materialize_binding("audit", store_pkg)

            self.assertTrue(link.is_dir())
            self.assertFalse(link.is_symlink())
            self.assertIn("harness version", (link / "SKILL.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
