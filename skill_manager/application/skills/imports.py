"""Import local skill folders into the central store.

This backs the "Import folder" affordance: the user points at one or more
folders (defaulting to each harness's managed skills root, e.g. ``~/.claude/skills``),
sees the real, non-symlinked skill packages sitting there, and batch-imports the
ones they pick into the shared store as ``centralized:`` packages — the same
package kind a workspace push-back creates, so imported skills behave identically.

Symlinks are deliberately skipped: a symlinked entry is already a binding into
the store (or elsewhere), not a local skill to adopt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from skill_manager.harness import FileTreeBindingProfile, HarnessKernelService

from .identity import SourceDescriptor
from .package import SkillParseError, parse_skill_package
from .read_models import SkillsReadModelService


@dataclass(frozen=True)
class ImportableSkill:
    dir: str
    name: str
    description: str
    source_path: str
    in_store: bool


@dataclass(frozen=True)
class FolderScan:
    path: str
    display_path: str
    exists: bool
    is_default: bool
    error: str | None
    linked_count: int
    skills: tuple[ImportableSkill, ...]


@dataclass
class ImportResult:
    imported: list[str] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)
    failures: list[dict[str, str]] = field(default_factory=list)


class SkillImportService:
    def __init__(
        self,
        read_models: SkillsReadModelService,
        kernel: HarnessKernelService,
    ) -> None:
        self.read_models = read_models
        self.kernel = kernel

    @property
    def _store(self):
        return self.read_models.store

    def default_folders(self) -> list[Path]:
        """The managed skills root of every known harness (``~/.claude/skills``,
        ``~/.agents/skills``, ...), deduped by resolved path and preserving order."""
        seen: set[Path] = set()
        folders: list[Path] = []
        for binding in self.kernel.bindings_for_family("skills"):
            profile = binding.profile
            if not isinstance(profile, FileTreeBindingProfile):
                continue
            root = profile.resolve_managed_root(self.kernel.context)
            resolved = root.expanduser().resolve(strict=False)
            if resolved in seen:
                continue
            seen.add(resolved)
            folders.append(root)
        return folders

    def scan(self, extra_folders: list[str] | None = None) -> list[FolderScan]:
        defaults = self.default_folders()
        default_resolved = {p.expanduser().resolve(strict=False) for p in defaults}

        results: list[FolderScan] = [self._scan_folder(p, is_default=True) for p in defaults]

        for raw in extra_folders or []:
            candidate = Path(raw).expanduser()
            resolved = candidate.resolve(strict=False)
            if resolved in default_resolved:
                continue  # already shown as a default
            default_resolved.add(resolved)
            results.append(self._scan_folder(candidate, is_default=False))
        return results

    def _scan_folder(self, folder: Path, *, is_default: bool) -> FolderScan:
        display = self._display(folder)
        store_root = self._store.root.expanduser().resolve(strict=False)
        expanded = folder.expanduser()

        if not expanded.exists() or not expanded.is_dir():
            return FolderScan(
                path=str(expanded), display_path=display, exists=False,
                is_default=is_default, error=None, linked_count=0, skills=(),
            )

        # Never offer the store's own packages back as an "import".
        if expanded.resolve(strict=False) == store_root:
            return FolderScan(
                path=str(expanded), display_path=display, exists=True,
                is_default=is_default, error=None, linked_count=0, skills=(),
            )

        skills: list[ImportableSkill] = []
        linked = 0
        try:
            children = sorted(expanded.iterdir())
        except OSError as error:
            return FolderScan(
                path=str(expanded), display_path=display, exists=True,
                is_default=is_default, error=str(error), linked_count=0, skills=(),
            )

        for child in children:
            if child.is_symlink():
                # A symlinked package is already a binding, not a local skill.
                if (child / "SKILL.md").is_file():
                    linked += 1
                continue
            if not child.is_dir() or not (child / "SKILL.md").is_file():
                continue
            try:
                package = parse_skill_package(
                    child,
                    default_source=SourceDescriptor(kind="local", locator=f"local:{child}"),
                )
            except SkillParseError:
                continue
            in_store = (self._store.root / child.name).is_dir()
            skills.append(
                ImportableSkill(
                    dir=child.name,
                    name=package.declared_name or child.name,
                    description=package.description,
                    source_path=str(child),
                    in_store=in_store,
                )
            )

        return FolderScan(
            path=str(expanded), display_path=display, exists=True,
            is_default=is_default, error=None, linked_count=linked, skills=tuple(skills),
        )

    def apply(self, source_paths: list[str]) -> ImportResult:
        result = ImportResult()
        changed = False
        for raw in source_paths:
            path = Path(raw).expanduser()
            if not path.is_dir() or not (path / "SKILL.md").is_file():
                result.failures.append({"path": raw, "error": "not a skill package (missing SKILL.md)"})
                continue
            name = path.name
            if (self._store.root / name).is_dir():
                result.skipped.append({"path": raw, "reason": "already_in_store"})
                continue
            try:
                package = parse_skill_package(
                    path,
                    default_source=SourceDescriptor(kind="centralized", locator=f"centralized:{name}"),
                )
                self._store.ingest(
                    source_path=path,
                    declared_name=package.declared_name or name,
                    source_kind="centralized",
                    source_locator=f"centralized:{name}",
                )
                result.imported.append(name)
                changed = True
            except (ValueError, OSError) as error:
                result.failures.append({"path": raw, "error": str(error)})
        if changed:
            self.read_models.invalidate()
        return result

    def _display(self, folder: Path) -> str:
        home = self.kernel.context.home
        try:
            relative = folder.expanduser().relative_to(home)
            return str(Path("~") / relative)
        except ValueError:
            return str(folder)
