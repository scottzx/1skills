from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from skill_manager.application.container import build_backend_container


def _write_skill(root: Path, name: str) -> Path:
    d = root / name
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(f"---\nname: {name}\ndescription: test {name}\n---\nbody\n")
    return d


def _container(tmp: Path):
    env = {
        "XDG_DATA_HOME": str(tmp / "data"),
        "XDG_CONFIG_HOME": str(tmp / "cfg"),
        "XDG_STATE_HOME": str(tmp / "state"),
    }
    return build_backend_container(env=env)


class SkillImportServiceTests(unittest.TestCase):
    def test_scan_skips_symlinks_and_flags_in_store(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            src = tmp / "src"
            _write_skill(src, "alpha")
            _write_skill(src, "beta")
            os.symlink(src / "alpha", src / "linked-alpha")  # must be ignored
            (src / "notaskill").mkdir()  # no SKILL.md

            svc = _container(tmp).skills_imports
            folder = next(f for f in svc.scan([str(src)]) if not f.is_default)

            self.assertTrue(folder.exists)
            self.assertEqual(folder.linked_count, 1)
            self.assertEqual(sorted(s.name for s in folder.skills), ["alpha", "beta"])
            self.assertTrue(all(s.in_store is False for s in folder.skills))

    def test_default_folders_include_claude_root(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            svc = _container(Path(tmp_dir)).skills_imports
            defaults = {str(p) for p in svc.default_folders()}
            self.assertTrue(any(p.endswith("/.claude/skills") for p in defaults))

    def test_apply_imports_then_dedupes(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            src = tmp / "src"
            _write_skill(src, "alpha")
            _write_skill(src, "beta")

            svc = _container(tmp).skills_imports
            result = svc.apply([str(src / "alpha"), str(src / "beta")])
            self.assertEqual(sorted(result.imported), ["alpha", "beta"])
            self.assertEqual(result.failures, [])

            folder = next(f for f in svc.scan([str(src)]) if not f.is_default)
            self.assertTrue(all(s.in_store for s in folder.skills))

            again = svc.apply([str(src / "alpha")])
            self.assertEqual(again.imported, [])
            self.assertEqual(
                again.skipped,
                [{"path": str(src / "alpha"), "reason": "already_in_store"}],
            )

    def test_apply_rejects_non_skill_folder(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            plain = tmp / "plain"
            plain.mkdir()
            svc = _container(tmp).skills_imports
            result = svc.apply([str(plain)])
            self.assertEqual(result.imported, [])
            self.assertEqual(len(result.failures), 1)


if __name__ == "__main__":
    unittest.main()
