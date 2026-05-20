#!/usr/bin/env python3
"""Inject a `title:` frontmatter field into md files that lack one.

The local-only trees rsync'd into src/content/docs/local/ (cub_sys/roadmap,
cubrid_cv/{issue,plan,...}) include files that either have no frontmatter at
all or have frontmatter without a `title:` key (e.g. JIRA draft files that
start with `project: CBRD`). Starlight's docsSchema requires `title`, so we
synthesize one here.

Title source order:
  1. First `# H1` line in the body
  2. Filename stem, with separators normalized

Files that already have `title:` are left untouched.
"""

import argparse
import pathlib
import re
import sys

H1_RE = re.compile(r"^#\s+(.+?)\s*$")
TITLE_KEY_RE = re.compile(r"^title\s*:", re.MULTILINE)


def derive_title(body: str, stem: str) -> str:
    for line in body.splitlines():
        m = H1_RE.match(line)
        if m:
            return m.group(1).strip()
    return stem.replace("_", " ").replace("-", " ").strip()


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def process(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    if lines and lines[0].rstrip("\n") == "---":
        end = None
        for i in range(1, len(lines)):
            if lines[i].rstrip("\n") == "---":
                end = i
                break
        if end is None:
            return False
        fm_block = "".join(lines[1:end])
        if TITLE_KEY_RE.search(fm_block):
            return False
        body = "".join(lines[end + 1:])
        title = derive_title(body, path.stem)
        new_lines = (
            [lines[0]]
            + [f"title: {quote(title)}\n"]
            + lines[1:]
        )
        path.write_text("".join(new_lines), encoding="utf-8")
        return True

    title = derive_title(text, path.stem)
    fm = f"---\ntitle: {quote(title)}\n---\n"
    if text and not text.startswith("\n"):
        fm += "\n"
    path.write_text(fm + text, encoding="utf-8")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=pathlib.Path)
    args = ap.parse_args()

    if not args.root.is_dir():
        print(f"inject_title: {args.root} is not a directory", file=sys.stderr)
        return 1

    changed = 0
    total = 0
    for p in args.root.rglob("*.md"):
        if p.name in ("README.md", "CLAUDE.md", "AGENTS.md"):
            continue
        total += 1
        try:
            if process(p):
                changed += 1
        except (OSError, UnicodeDecodeError) as e:
            print(f"inject_title: skip {p}: {e}", file=sys.stderr)

    print(f"inject_title: injected into {changed}/{total} file(s) under {args.root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
