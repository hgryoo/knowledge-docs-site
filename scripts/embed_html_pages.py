#!/usr/bin/env python3
"""Publish standalone HTML documents from a local tree as Starlight pages.

Markdown in the local trees becomes a Starlight page directly. A standalone
HTML document (e.g. cubrid_cv's plan/lock_manager/book/book.html — a pandoc
build that bundles a whole book into one self-contained file) cannot: Astro's
content collection only loads md/mdx/mdoc, so today such a file is simply
dropped by prebuild.sh's rsync filters and is invisible on the site.

This script gives those files the same treatment as markdown, in two steps:

  1. copy the .html — plus the asset files sitting next to it — into
     public/embed/<tree>/…, so the site serves it verbatim; and
  2. write an .mdx stub at the matching spot in the content tree. The stub
     renders <HtmlEmbed>, i.e. an iframe of that file plus an
     "open in new tab" link.

The stub is an ordinary Starlight page, so the document shows up in the
sidebar exactly where its source file sits in the tree and opens in the main
panel. Stub filename is "<stem>-html.mdx" (book.html → book-html.mdx, slug
".../book-html"): unlike "book.mdx" it cannot collide with a markdown
sibling of the same stem, and unlike "book.html.mdx" it does not produce the
dot-stripped "bookhtml" slug Astro would derive from it. The sidebar entry
still reads "book.html" — the label carries the real file name.

A document that knows a better sidebar name than either default can say so
with <meta name="sidebar-label" content="…"> and that wins over --patterns'
caller-chosen convention; see derive_label().

Which HTML files participate is caller-controlled (--patterns, fed from the
4th field of a local-trees.conf entry). Two kinds of file are skipped even
when a pattern matches them, because embedding them makes no sense:

  * fragments — no <html> root element, i.e. an include, not a document;
  * build templates — anything named template.html or *[-_.]template.html
    (plan/lock_manager/book/template.html is the input build_html.py fills
    in to produce book.html).

Content sniffing is deliberately limited to the <html> check: the book's
inlined SVGs are full of comments like <!-- HOME -->, so "looks like it has
placeholders" is not a usable signal. Skips are reported on stdout so the
filtering stays inspectable.
"""

import argparse
import html as html_mod
import json
import os
import pathlib
import re
import shutil
import sys

# Asset files copied alongside an embedded document so its relative refs
# keep resolving: everything in the document's own directory, plus the
# contents of an adjacent conventionally-named asset directory.
ASSET_SUFFIXES = {
    ".css", ".js", ".mjs", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".avif",
    ".woff", ".woff2", ".ttf", ".otf",
}
ASSET_DIRS = {"assets", "fig", "figs", "img", "images", "static", "css", "js", "media"}

# Never walked into while looking for HTML documents.
SKIP_DIRS = {"node_modules", "dist", "__pycache__", "venv"}

HTML_ROOT_RE = re.compile(r"<html[\s>]", re.IGNORECASE)
TEMPLATE_NAME_RE = re.compile(r"^(.*[-_.])?template\.html?$", re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
SIDEBAR_META_RE = re.compile(
    r"""<meta\b[^>]*\bname=["']sidebar-label["'][^>]*>""", re.IGNORECASE)
META_CONTENT_RE = re.compile(r"""\bcontent=["']([^"']*)["']""", re.IGNORECASE)


def glob_to_re(pattern: str) -> "re.Pattern[str]":
    """Translate a path glob to a regex. `**` crosses `/`, `*` and `?` do not."""
    out = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:[^/]+/)*")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def parse_patterns(raw: str) -> list["re.Pattern[str]"]:
    pats = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        # Shorthands for "every HTML document in this tree".
        if item in ("html", "*"):
            item = "**/*.html"
        pats.append(glob_to_re(item))
    return pats


def iter_html(root: pathlib.Path, subdirs: list[str]):
    roots = [root / s for s in subdirs] if subdirs else [root]
    for r in roots:
        if not r.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(r):
            dirnames[:] = [
                d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS
            ]
            for fn in sorted(filenames):
                if fn.lower().endswith((".html", ".htm")):
                    yield pathlib.Path(dirpath) / fn


def derive_title(text: str, fallback: str) -> str:
    for pat in (TITLE_RE, H1_RE):
        m = pat.search(text)
        if m:
            title = html_mod.unescape(TAG_RE.sub("", m.group(1)))
            title = " ".join(title.split())
            if title:
                return title
    return fallback


def derive_label(text: str, flag: str, filename: str, title: str) -> str:
    """Sidebar label: an explicit declaration in the document wins over --sidebar-label.

    A generated multi-page document (e.g. a book split into one HTML per
    chapter) knows its own short name for the sidebar, and neither default
    serves it: the filename is opaque ("ch-3.html") and the <title> carries
    the full "<chapter> — <book>" string meant for the browser tab. Such a
    page declares the short form itself:

        <meta name="sidebar-label" content="3장 강제 drain 이 얼마나 나빴는가">

    Documents without the tag are unaffected and follow --sidebar-label.
    """
    m = SIDEBAR_META_RE.search(text)
    if m:
        c = META_CONTENT_RE.search(m.group(0))
        if c:
            label = " ".join(html_mod.unescape(c.group(1)).split())
            if label:
                return label
    return filename if flag == "filename" else title


def yaml_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def copy_assets(src_dir: pathlib.Path, dest_dir: pathlib.Path) -> int:
    copied = 0
    for entry in sorted(src_dir.iterdir()):
        if entry.is_file() and entry.suffix.lower() in ASSET_SUFFIXES:
            shutil.copy2(entry, dest_dir / entry.name)
            copied += 1
        elif entry.is_dir() and entry.name.lower() in ASSET_DIRS:
            for sub in sorted(entry.rglob("*")):
                if not sub.is_file() or sub.suffix.lower() not in ASSET_SUFFIXES:
                    continue
                target = dest_dir / sub.relative_to(src_dir)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(sub, target)
                copied += 1
    return copied


def write_stub(
    stub_path: pathlib.Path,
    site_root: pathlib.Path,
    url: str,
    title: str,
    label: str,
) -> None:
    stub_path.parent.mkdir(parents=True, exist_ok=True)
    component = site_root / "src/components/HtmlEmbed.astro"
    # Relative import: no vite alias needed, works from any tree depth.
    import_path = os.path.relpath(component, stub_path.parent)
    if not import_path.startswith("."):
        import_path = "./" + import_path
    stub_path.write_text(
        "---\n"
        f"title: {yaml_quote(title)}\n"
        "sidebar:\n"
        f"  label: {yaml_quote(label)}\n"
        "tableOfContents: false\n"
        "---\n"
        "\n"
        f"import HtmlEmbed from {json.dumps(import_path)};\n"
        "\n"
        f"<HtmlEmbed src={json.dumps(url)} "
        f"title={{{json.dumps(title, ensure_ascii=False)}}} />\n",
        encoding="utf-8",
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, required=True,
                    help="tree root on disk (same path local-trees.conf gives)")
    ap.add_argument("--subdirs", default="",
                    help="comma-separated whitelist of immediate children to scan")
    ap.add_argument("--patterns", required=True,
                    help="comma-separated globs, relative to --src; "
                         "'html' or '*' means **/*.html")
    ap.add_argument("--content", type=pathlib.Path, required=True,
                    help="content dir the tree was rsync'd into (EN)")
    ap.add_argument("--ko-content", type=pathlib.Path, default=None,
                    help="KO mirror of --content; stubs are locale-agnostic")
    ap.add_argument("--public", type=pathlib.Path, required=True,
                    help="dir under public/ that receives the raw HTML")
    ap.add_argument("--url-prefix", required=True,
                    help="site-root-relative URL of --public, e.g. embed/cubrid_cv")
    ap.add_argument("--sidebar-label", choices=("filename", "title"), default="title",
                    help="filename mirrors inject_sidebar_label.py's convention; "
                         "either is overridden by a page's own "
                         "<meta name=\"sidebar-label\">")
    args = ap.parse_args()

    if not args.src.is_dir():
        print(f"embed_html_pages: {args.src} is not a directory", file=sys.stderr)
        return 1

    site_root = pathlib.Path(__file__).resolve().parent.parent
    patterns = parse_patterns(args.patterns)
    if not patterns:
        return 0
    subdirs = [s.strip() for s in args.subdirs.split(",") if s.strip()]

    embedded = 0
    skipped = 0
    for path in iter_html(args.src, subdirs):
        rel = path.relative_to(args.src).as_posix()
        if not any(p.match(rel) for p in patterns):
            continue
        if TEMPLATE_NAME_RE.match(path.name):
            print(f"   skip {rel}: build template (by name)")
            skipped += 1
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"embed_html_pages: skip {rel}: {e}", file=sys.stderr)
            skipped += 1
            continue
        if not HTML_ROOT_RE.search(text):
            print(f"   skip {rel}: fragment (no <html> root)")
            skipped += 1
            continue

        public_file = args.public / rel
        public_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, public_file)
        copy_assets(path.parent, public_file.parent)

        url = f"{args.url_prefix.strip('/')}/{rel}"
        title = derive_title(text, path.stem)
        label = derive_label(text, args.sidebar_label, path.name, title)
        stub_rel = f"{rel[: -len(path.suffix)]}-html.mdx"
        for content_root in (args.content, args.ko_content):
            if content_root is None:
                continue
            write_stub(content_root / stub_rel, site_root, url, title, label)
        print(f"   embed {rel} → /{url}")
        embedded += 1

    print(f"embed_html_pages: {embedded} embedded, {skipped} skipped under {args.src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
