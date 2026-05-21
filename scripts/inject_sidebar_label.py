#!/usr/bin/env python3
"""Inject `sidebar.label: <filename>` frontmatter into md files under a tree.

Astro Starlight uses the page's `title:` for sidebar entries by default. For
cub_sys / cubrid_cv local trees we want the sidebar to show the raw filename
stem (without the `.md` extension) instead, so readers can find a file in
the sidebar by the path they reference in chat / commits / JIRA.

The page `title:` is left untouched — only the sidebar label changes. Page
H1, OG metadata, and search index stay driven by the original title.

Skips any file whose path contains a code-analysis segment (these docs keep
their narrative titles in the sidebar — the filename stem isn't useful as a
label there).

Files that already declare `sidebar:` in frontmatter are left alone — the
hand-authored entry wins, matching inject_title.py's convention.
"""

import argparse
import pathlib
import re
import sys

SIDEBAR_KEY_RE = re.compile(r"^sidebar\s*:", re.MULTILINE)
CODE_ANALYSIS_SEGMENT = "code-analysis"


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def process(path: pathlib.Path) -> bool:
    # Skip code-analysis subtrees.
    if CODE_ANALYSIS_SEGMENT in path.parts:
        return False

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    stem = path.stem  # filename without .md extension, no normalization

    if not lines or lines[0].rstrip("\n") != "---":
        # No frontmatter — leave untouched. inject_title.py is responsible
        # for creating frontmatter from scratch; we layer on top.
        return False

    end = None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") == "---":
            end = i
            break
    if end is None:
        return False

    fm_block = "".join(lines[1:end])
    if SIDEBAR_KEY_RE.search(fm_block):
        return False

    new_lines = (
        lines[:end]
        + [f"sidebar:\n", f"  label: {quote(stem)}\n"]
        + lines[end:]
    )
    path.write_text("".join(new_lines), encoding="utf-8")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=pathlib.Path)
    args = ap.parse_args()

    if not args.root.is_dir():
        print(
            f"inject_sidebar_label: {args.root} is not a directory",
            file=sys.stderr,
        )
        return 1

    changed = 0
    for path in args.root.rglob("*.md"):
        if process(path):
            changed += 1

    print(f"inject_sidebar_label: {changed} file(s) updated under {args.root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
