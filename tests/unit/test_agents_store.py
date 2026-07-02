from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from skill_manager.application.container import build_backend_container


def _write_agent(root: Path, name: str, description: str = "test agent") -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{name}.md"
    path.write_text(
        f"---\nname: {name}\ndescription: {description}\ntools: Read, Edit\nmodel: sonnet\n---\nsystem prompt for {name}\n"
    )
    return path


def _container(tmp: Path):
    env = {
        "XDG_DATA_HOME": str(tmp / "data"),
        "XDG_CONFIG_HOME": str(tmp / "cfg"),
        "XDG_STATE_HOME": str(tmp / "state"),
    }
    return build_backend_container(env=env)


class AgentStoreTests(unittest.TestCase):
    def test_ingest_then_scan_reports_in_store(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            src = tmp / "src"
            _write_agent(src, "alpha")
            store = _container(tmp).agents_store

            dest = store.ingest(
                source_path=src / "alpha.md",
                declared_name="alpha",
                source_kind="centralized",
                source_locator="centralized:alpha.md",
            )
            self.assertTrue(dest.is_file())
            self.assertEqual(dest.name, "alpha.md")

            scan = store.scan()
            self.assertEqual([p.package.declared_name for p in scan.packages], ["alpha"])
            self.assertEqual(scan.packages[0].package.description, "test agent")

    def test_differs_from_and_update_changes_revision(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            src = tmp / "src"
            _write_agent(src, "beta", description="v1")
            store = _container(tmp).agents_store
            store.ingest(
                source_path=src / "beta.md",
                declared_name="beta",
                source_kind="centralized",
                source_locator="centralized:beta.md",
            )
            rev_before = store.scan().packages[0].recorded_revision

            # identical source -> no diff, no-op update
            self.assertFalse(store.differs_from("beta.md", src / "beta.md"))
            _dest, changed = store.update("beta.md", source_path=src / "beta.md")
            self.assertFalse(changed)

            # modify the source -> diff + revision changes
            _write_agent(src, "beta", description="v2-modified")
            self.assertTrue(store.differs_from("beta.md", src / "beta.md"))
            _dest, changed = store.update("beta.md", source_path=src / "beta.md")
            self.assertTrue(changed)

            rev_after = store.scan().packages[0].recorded_revision
            self.assertIsNotNone(rev_before)
            self.assertIsNotNone(rev_after)
            self.assertNotEqual(rev_before, rev_after)

    def test_delete_removes_file_and_manifest_entry(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            src = tmp / "src"
            _write_agent(src, "gamma")
            store = _container(tmp).agents_store
            store.ingest(
                source_path=src / "gamma.md",
                declared_name="gamma",
                source_kind="centralized",
                source_locator="centralized:gamma.md",
            )
            self.assertTrue((store.root / "gamma.md").is_file())

            store.delete("gamma.md")
            self.assertFalse((store.root / "gamma.md").exists())
            self.assertEqual(store.scan().packages, ())
            with self.assertRaises(ValueError):
                store.ensure_deletable("gamma.md")

    def test_claude_agents_binding_resolves_default_managed_root(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            container = _container(tmp)
            adapters = container.agents_read_models.adapters
            claude = next(a for a in adapters if a.harness == "claude")
            self.assertTrue(str(claude.managed_root).endswith("/.claude/agents"))


if __name__ == "__main__":
    unittest.main()
