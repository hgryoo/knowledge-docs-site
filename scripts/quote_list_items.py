#!/usr/bin/env python3
"""Quote every unquoted block-sequence item inside frontmatter.

The local trees (cub_sys/roadmap, cubrid_cv/*) contain ad-hoc list items
like:

    sources:
      - $KB_ROOT/knowledge/.../cubrid-mvcc.md — MVCC notes
      - `/data/cub_sys/HammerDB/` (CUBRID.md)
      - AWS Blog — "Improve performance: diagnose contention"

Each of these trips js-yaml: `$`/`` ` `` are reserved indicators, and
`performance: diagnose` becomes a mapping inside a sequence. The schema
already accepts `z.array(z.unknown())` for `sources`/`references`, so we
just need the YAML to parse — quoting every plain item makes that
guaranteed.

Items already in flow form (`{...}`, `[...]`) or already quoted
(`'...'`, `"..."`) are left untouched. Sub-mapping items
(`- key: value` on the same line, or `-` followed by an indented mapping)
are left untouched too.

We deliberately do NOT modify the shared sanitize_frontmatter.py — that
file is kept verbatim with knowledge-base-site. This pass is a
local-trees-only addendum.
"""

import argparse
import pathlib
import re
import sys

SEQ_ITEM_RE = re.compile(r"^(\s*-\s+)(.+?)\s*$")
KV_LINE_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*)(\s*:\s+)(.+?)\s*$")
KV_LIKE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*\s*:(\s|$)")
ALREADY_QUOTED_OR_FLOW = ("'", '"', "{", "[")
BLOCK_SCALAR = ("|", ">")


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def process_frontmatter(text: str) -> tuple[str, int]:
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
        raw = lines[i]
        if raw.endswith("\n"):
            body, nl = raw[:-1], "\n"
        else:
            body, nl = raw, ""

        seq = SEQ_ITEM_RE.match(body)
        if seq:
            prefix, value = seq.group(1), seq.group(2)
            if not value:
                continue
            if value.startswith(ALREADY_QUOTED_OR_FLOW):
                continue
            if KV_LIKE_RE.match(value):
                # genuine `- key: value` mapping entry — leave alone
                continue
            lines[i] = f"{prefix}{quote(value)}{nl}"
            fixes += 1
            continue

        kv = KV_LINE_RE.match(body)
        if kv:
            key, sep, value = kv.group(1), kv.group(2), kv.group(3)
            if value.startswith(ALREADY_QUOTED_OR_FLOW):
                continue
            if value.startswith(BLOCK_SCALAR):
                continue
            # YAML treats `: ` inside an unquoted scalar as a mapping
            # boundary, which crashes block-mapping parse. Quote
            # defensively whenever the value contains it.
            if ": " in value:
                lines[i] = f"{key}{sep}{quote(value)}{nl}"
                fixes += 1
            continue

    return "".join(lines), fixes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=pathlib.Path)
    args = ap.parse_args()

    if not args.root.is_dir():
        print(f"quote_list_items: {args.root} is not a directory", file=sys.stderr)
        return 1

    files_changed = 0
    items_quoted = 0
    for p in args.root.rglob("*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            print(f"quote_list_items: skip {p}: {e}", file=sys.stderr)
            continue
        new_text, fixes = process_frontmatter(text)
        if fixes:
            p.write_text(new_text, encoding="utf-8")
            files_changed += 1
            items_quoted += fixes

    print(f"quote_list_items: quoted {items_quoted} item(s) across "
          f"{files_changed} file(s) under {args.root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
