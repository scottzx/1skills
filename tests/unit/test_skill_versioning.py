"""Store-level tests for stable-id versioning + lineage (Issue #379)."""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from skill_manager.application.skills.history import SkillHistoryStore
from skill_manager.application.skills.package import fingerprint_package
from skill_manager.application.skills.skillmeta import (
    SKILLMETA_FILENAME,
    SkillMeta,
    read_skill_meta,
    write_skill_meta,
)
from skill_manager.application.skills.store import SkillStore

from tests.support.fake_home import create_fake_home_spec, seed_skill_package


def _make_store(temp: Path) -> tuple[SkillStore, object]:
    spec = create_fake_home_spec(temp)
    store = SkillStore(
        spec.skills_store_root,
        history=SkillHistoryStore(spec.skills_store_root.parent / "history"),
    )
    return store, spec


class SidecarFingerprintTests(unittest.TestCase):
    def test_sidecar_excluded_from_fingerprint(self) -> None:
        with TemporaryDirectory() as temp:
            src = seed_skill_package(Path(temp) / "src", "audit", "Audit")
            before, _ = fingerprint_package(src)
            write_skill_meta(src, SkillMeta(id="skl_x", base_version=7))
            after, _ = fingerprint_package(src)
            self.assertEqual(before, after)


class IngestIdentityTests(unittest.TestCase):
    def test_ingest_assigns_id_sidecar_and_history_v1(self) -> None:
        with TemporaryDirectory() as temp:
            store, _ = _make_store(Path(temp))
            src = seed_skill_package(Path(temp) / "src", "audit", "Audit")
            dest = store.ingest(
                source_path=src,
                declared_name="Audit",
                source_kind="centralized",
                source_locator="centralized:audit",
            )
            entry = store.entry_for_dir(dest.name)
            self.assertIsNotNone(entry.id)
            self.assertEqual(entry.version, 1)
            self.assertTrue(entry.is_primary)
            meta = read_skill_meta(dest)
            self.assertEqual(meta.id, entry.id)
            self.assertEqual(meta.base_version, 1)
            self.assertTrue(store.history.has_version(entry.id, 1))

    def test_duplicate_name_disambiguates_dir_but_distinct_ids(self) -> None:
        with TemporaryDirectory() as temp:
            store, _ = _make_store(Path(temp))
            src1 = seed_skill_package(Path(temp) / "a", "review", "Review", body="one")
            src2 = seed_skill_package(Path(temp) / "b", "review", "Review", body="two")
            d1 = store.ingest(source_path=src1, declared_name="Review", source_kind="centralized", source_locator="c:1")
            d2 = store.ingest(
                source_path=src2,
                declared_name="Review",
                source_kind="centralized",
                source_locator="c:2",
                allow_duplicate_name=True,
            )
            self.assertNotEqual(d1.name, d2.name)
            self.assertNotEqual(store.entry_for_dir(d1.name).id, store.entry_for_dir(d2.name).id)


class UpdateHistoryTests(unittest.TestCase):
    def test_update_bumps_version_and_snapshots(self) -> None:
        with TemporaryDirectory() as temp:
            store, _ = _make_store(Path(temp))
            src = seed_skill_package(Path(temp) / "v1", "audit", "Audit", body="one")
            dest = store.ingest(source_path=src, declared_name="Audit", source_kind="centralized", source_locator="c")
            sid = store.entry_for_dir(dest.name).id
            src2 = seed_skill_package(Path(temp) / "v2", "audit", "Audit", body="two")
            _, changed = store.update(dest.name, source_path=src2)
            self.assertTrue(changed)
            self.assertEqual(store.version_of(dest.name), 2)
            self.assertTrue(store.history.has_version(sid, 1))
            self.assertTrue(store.history.has_version(sid, 2))
            self.assertEqual(read_skill_meta(dest).base_version, 2)

    def test_restore_is_non_destructive(self) -> None:
        with TemporaryDirectory() as temp:
            store, _ = _make_store(Path(temp))
            src = seed_skill_package(Path(temp) / "v1", "audit", "Audit", body="one")
            dest = store.ingest(source_path=src, declared_name="Audit", source_kind="centralized", source_locator="c")
            sid = store.entry_for_dir(dest.name).id
            store.update(dest.name, source_path=seed_skill_package(Path(temp) / "v2", "audit", "Audit", body="two"))
            new_version = store.restore(sid, 1)
            self.assertEqual(new_version, 3)  # restore appends, never rewrites
            self.assertIn("one", (dest / "SKILL.md").read_text())
            self.assertEqual(store.version_of(dest.name), 3)


class LineageTests(unittest.TestCase):
    def test_set_primary_moves_flag_within_component(self) -> None:
        with TemporaryDirectory() as temp:
            store, _ = _make_store(Path(temp))
            base = store.ingest(
                source_path=seed_skill_package(Path(temp) / "a", "review", "Review", body="base"),
                declared_name="Review",
                source_kind="centralized",
                source_locator="c",
            )
            base_id = store.entry_for_dir(base.name).id
            fork = store.ingest(
                source_path=seed_skill_package(Path(temp) / "b", "review", "Review", body="fork"),
                declared_name="Review",
                source_kind="centralized",
                source_locator="c",
                allow_duplicate_name=True,
                forked_from=base_id,
                forked_from_version=1,
                is_primary=False,
            )
            fork_id = store.entry_for_dir(fork.name).id
            store.set_primary(fork_id)
            self.assertFalse(store.entry_for_id(base_id).is_primary)
            self.assertTrue(store.entry_for_id(fork_id).is_primary)
            lineage = store.lineage(fork_id)
            self.assertEqual(lineage["primaryId"], fork_id)
            self.assertEqual({b["id"] for b in lineage["branches"]}, {base_id, fork_id})


class MigrationTests(unittest.TestCase):
    def test_migration_backfills_ids_and_history_idempotently(self) -> None:
        with TemporaryDirectory() as temp:
            spec = create_fake_home_spec(Path(temp))
            # legacy store: package on disk + manifest entry WITHOUT an id
            seed_skill_package(spec.skills_store_root, "audit", "Audit")
            from skill_manager.application.skills.manifest import SkillStoreEntry
            from tests.support.fake_home import seed_store_manifest

            revision, _ = fingerprint_package(spec.skills_store_root / "audit")
            seed_store_manifest(
                spec,
                [SkillStoreEntry("audit", "Audit", "centralized", "c:audit", revision, version=1)],
            )
            store = SkillStore(
                spec.skills_store_root,
                history=SkillHistoryStore(spec.skills_store_root.parent / "history"),
            )
            store.migrate_ids_and_history()
            entry = store.entry_for_dir("audit")
            self.assertIsNotNone(entry.id)
            self.assertTrue((spec.skills_store_root / "audit" / SKILLMETA_FILENAME).is_file())
            self.assertTrue(store.history.has_version(entry.id, 1))
            first_id = entry.id
            store.migrate_ids_and_history()  # idempotent
            self.assertEqual(store.entry_for_dir("audit").id, first_id)


if __name__ == "__main__":
    unittest.main()
