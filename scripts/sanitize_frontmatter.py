#!/usr/bin/env python3
"""Quote YAML frontmatter scalars that would otherwise break js-yaml's
strict parse.

The site is built from upstream content (../knowledge-base) that
occasionally lands with frontmatter like:

    title: [KO] CUBRID Lock Manager — ...
    summary: `unloaddb` end-to-end analysis ...

Both fail js-yaml's strict parse: `[` opens a flow sequence (and the
trailing `]` is far away), and `` ` `` is one of YAML's reserved
indicators at scalar start. We can't fix upstream from here (the kb's
own automation rewrites the files), so we sanitize the rsync'd content
tree in place after prebuild and before the Astro/Starlight content
collection runs.

Direct port of knowledge-base-site/scripts/sanitize_frontmatter.py —
kept verbatim so the two sites stay in lockstep.
"""

import argparse
import pathlib
import re
import sys

LIST_KEYS = {"references", "tags", "sources", "aliases"}
PROSE_KEYS = {"title", "summary", "description"}
UNSAFE_LEADS = ("[", "`", "@", "{")
KV_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*): (.*)$")


def needs_quote(key: str, value: str) -> bool:
    if not value:
        return False
    if value.startswith("'") or value.startswith('"'):
        return False
    if value in ("|", ">") or value.startswith(("|", ">")):
        return False
    if key in PROSE_KEYS:
        return True
    return value.startswith(UNSAFE_LEADS)


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sanitize_frontmatter(text: str) -> tuple[str, int]:
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        return text, 0
    end = None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") == "---":
            end = i
            break
    if end is None:
        return text, 0

    fixes = 0
    for i in range(1, end):
        line = lines[i]
        if not line.endswith("\n"):
            line_body, nl = line, ""
        else:
            line_body, nl = line[:-1], "\n"
        m = KV_RE.match(line_body)
        if not m:
            continue
        key, value = m.group(1), m.group(2)
        if key in LIST_KEYS:
            continue
        if not needs_quote(key, value):
            continue
        lines[i] = f"{key}: {quote(value)}{nl}"
        fixes += 1

    return "".join(lines), fixes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=pathlib.Path, help="content/ root to walk")
    args = ap.parse_args()

    if not args.root.is_dir():
        print(f"sanitize: {args.root} is not a directory", file=sys.stderr)
        return 1

    total_files = 0
    total_fixes = 0
    for p in args.root.rglob("*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            print(f"sanitize: skip {p}: {e}", file=sys.stderr)
            continue
        new_text, fixes = sanitize_frontmatter(text)
        if fixes:
            p.write_text(new_text, encoding="utf-8")
            total_files += 1
            total_fixes += fixes

    print(f"sanitize: {total_fixes} scalar(s) quoted across "
          f"{total_files} file(s) under {args.root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
