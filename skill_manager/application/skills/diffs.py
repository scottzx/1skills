"""Per-file unified diffs between two skill package snapshots (#379).

Powers two "see what changed" surfaces: the push preview (workspace copy vs the
current 母体) and the version-history compare (one snapshot vs another). Text
files are diffed with difflib; the sidecar / .DS_Store are ignored (identity, not
content); binary files are reported changed without a textual diff.
"""

from __future__ import annotations

import difflib
from pathlib import Path

_SKIP = {".skillmeta.json", ".DS_Store"}


def _read_text_files(root: Path) -> dict[str, str | None]:
    files: dict[str, str | None] = {}
    if not root.is_dir():
        return files
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        if path.name in _SKIP:
            continue
        rel = path.relative_to(root).as_posix()
        try:
            files[rel] = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            files[rel] = None  # binary / unreadable
    return files


def diff_packages(
    old_root: Path,
    new_root: Path,
    *,
    old_label: str = "old",
    new_label: str = "new",
) -> list[dict[str, object]]:
    """Unified diff of every file that differs between two package dirs.

    Returns one entry per changed file: ``{path, status, diff}`` where status is
    added | removed | modified and diff is a unified-diff string ("" for binary
    changes). Unchanged files are omitted."""
    old_files = _read_text_files(old_root)
    new_files = _read_text_files(new_root)
    out: list[dict[str, object]] = []
    for rel in sorted(set(old_files) | set(new_files)):
        in_old = rel in old_files
        in_new = rel in new_files
        old_text = old_files.get(rel)
        new_text = new_files.get(rel)
        if in_old and in_new and old_text == new_text:
            continue
        status = "added" if not in_old else "removed" if not in_new else "modified"
        if old_text is None or new_text is None:
            diff = ""  # binary — can't render a text diff
        else:
            diff = "".join(
                difflib.unified_diff(
                    old_text.splitlines(keepends=True),
                    new_text.splitlines(keepends=True),
                    fromfile=f"{old_label}/{rel}",
                    tofile=f"{new_label}/{rel}",
                    n=3,
                )
            )
            if old_text and not old_text.endswith("\n"):
                diff += "\n"
        out.append({"path": rel, "status": status, "diff": diff})
    return out


__all__ = ["diff_packages"]
