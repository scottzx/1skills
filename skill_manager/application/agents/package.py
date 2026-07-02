"""Parse a single subagent Markdown file into an AgentPackage.

Contrast skills, whose unit is a *directory* with SKILL.md. A subagent is a
single ``<name>.md`` file: YAML frontmatter (``name``, ``description``, ``tools``,
``model``, optional ``color``) + a Markdown body that is the subagent's system
prompt. The store/adapter are therefore file-based, not tree-based.

Identity (SourceDescriptor / stable_id) and the frontmatter parser are reused
from the skills family to avoid duplicating shared behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path

from ..skills.identity import SkillRef, SourceDescriptor
from ..skills.package import _parse_frontmatter, _normalize_metadata_scalar


class AgentParseError(ValueError):
    """Raised when an agent file cannot be parsed safely."""


@dataclass(frozen=True)
class AgentPackage:
    declared_name: str
    description: str
    root_path: Path  # the <name>.md file itself
    resolved_path: Path
    revision: str
    source: SourceDescriptor

    @property
    def ref(self) -> SkillRef:
        return SkillRef(source=self.source, declared_name=self.declared_name)


def find_agent_files(root: Path) -> tuple[Path, ...]:
    if not root.exists() or not root.is_dir():
        return ()
    return tuple(sorted(path for path in root.iterdir() if path.is_file() and path.suffix == ".md"))


def fingerprint_agent(path: Path) -> str:
    if not path.is_file():
        raise AgentParseError(f"agent file does not exist: {path}")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_agent_file(path: Path, *, default_source: SourceDescriptor) -> AgentPackage:
    if not path.is_file():
        raise AgentParseError(f"missing agent file: {path}")
    content = path.read_text(encoding="utf-8")
    metadata = _parse_frontmatter(content)
    declared_name = _extract_declared_name(path, metadata)
    description = _normalize_metadata_scalar(metadata.get("description", ""))
    source = _resolve_source(metadata, default_source=default_source)
    return AgentPackage(
        declared_name=declared_name,
        description=description,
        root_path=path,
        resolved_path=path.resolve(),
        revision=fingerprint_agent(path),
        source=source,
    )


def _extract_declared_name(path: Path, metadata: dict[str, str]) -> str:
    if metadata.get("name", "").strip():
        return _normalize_metadata_scalar(metadata["name"])
    return path.stem


def _resolve_source(metadata: dict[str, str], *, default_source: SourceDescriptor) -> SourceDescriptor:
    source_kind = metadata.get("source_kind", "").strip()
    source_locator = metadata.get("source_locator", "").strip()
    if source_kind and source_locator:
        return SourceDescriptor(kind=source_kind, locator=source_locator)
    return default_source


__all__ = [
    "AgentPackage",
    "AgentParseError",
    "find_agent_files",
    "fingerprint_agent",
    "parse_agent_file",
]
