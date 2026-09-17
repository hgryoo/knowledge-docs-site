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

Plain mapping values get the same treatment when they carry a `: `
(mapping boundary), a ` #` (comment start — `persona: PR #7698 ...`
silently truncates to `PR` and orphans the rest), or a continuation
line.

Items already in flow form (`{...}`, `[...]`) or already quoted
(`'...'`, `"..."`) are left untouched. Sub-mapping items
(`- key: value` on the same line, or `-` followed by an indented mapping)
are left untouched too.

A plain scalar may span several lines:

    sources:
      - code — src/base/lockfree_freelist.hpp, lockfree_hashmap.hpp,
        src/thread/thread_lockfree_hash_map.hpp

Quoting only the first line would leave the continuation dangling and
break the parse, so continuation lines are folded into the one quoted
scalar.

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


def indent_of(body: str) -> int:
    return len(body) - len(body.lstrip())


def fold_continuation(lines: list[str], start: int, end: int, indent: int) -> tuple[str, int]:
    """Consume the plain-scalar continuation lines that follow ``start``.

    Returns the folded text (empty when there is none) and the index of
    the first line that is not part of the scalar.
    """
    parts = []
    i = start
    while i < end:
        body = lines[i].rstrip("\n")
        stripped = body.strip()
        if not stripped:
            break
        if indent_of(body) <= indent:
            break
        if stripped == "-" or stripped.startswith("- "):
            break
        if KV_LIKE_RE.match(stripped):
            break
        parts.append(stripped)
        i += 1
    return " ".join(parts), i


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

    out = lines[:1]
    fixes = 0
    i = 1
    while i < end:
        raw = lines[i]
        if raw.endswith("\n"):
            body, nl = raw[:-1], "\n"
        else:
            body, nl = raw, ""

        seq = SEQ_ITEM_RE.match(body)
        if seq:
            prefix, value = seq.group(1), seq.group(2)
            if (
                value
                and not value.startswith(ALREADY_QUOTED_OR_FLOW)
                # genuine `- key: value` mapping entry — leave alone
                and not KV_LIKE_RE.match(value)
            ):
                tail, i = fold_continuation(lines, i + 1, end, indent_of(prefix))
                out.append(f"{prefix}{quote(value + ' ' + tail if tail else value)}{nl}")
                fixes += 1
                continue
            out.append(raw)
            i += 1
            continue

        kv = KV_LINE_RE.match(body)
        if kv:
            key, sep, value = kv.group(1), kv.group(2), kv.group(3)
            if not value.startswith(ALREADY_QUOTED_OR_FLOW) and not value.startswith(
                BLOCK_SCALAR
            ):
                tail, next_i = fold_continuation(lines, i + 1, end, indent_of(body))
                # `: ` inside an unquoted scalar is a mapping boundary and
                # ` #` starts a comment — both crash the block-mapping
                # parse. A continuation line has to be folded in, or the
                # quote we add would close the scalar and leave it
                # dangling. Quote defensively in all three cases.
                if ": " in value or " #" in value or tail:
                    merged = f"{value} {tail}" if tail else value
                    out.append(f"{key}{sep}{quote(merged)}{nl}")
                    fixes += 1
                    i = next_i
                    continue

        out.append(raw)
        i += 1

    out.extend(lines[end:])
    return "".join(out), fixes


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
