#!/usr/bin/env bash
# Materialize the analysis-doc trees from the sibling knowledge-base/ repo
# into src/content/docs/(en|ko)/code-analysis/<project> for every project
# in PROJECTS, then sanitize frontmatter so js-yaml's strict parse accepts
# every file.
#
# Source layout (kb side):
#   $SRC/code-analysis/<project>/<doc>.md          — English (primary)
#   $SRC/code-analysis/<project>/<doc>.assets/     — figures
#   $SRC/ko/code-analysis/<project>/<doc>.md       — Korean mirror
#   $SRC/ko/code-analysis/<project>/<doc>.assets/  — symlinks → EN assets
#
# Site layout (this side):
#   src/content/docs/code-analysis/<project>/...    — EN (root locale)
#   src/content/docs/ko/code-analysis/<project>/... — KO
#
# Override SRC=... to point at a different kb checkout (used in CI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SRC:-$SCRIPT_DIR/../knowledge-base/knowledge}"

# Bootstrap the gitignored local-trees marker so astro.config.mjs's static
# import of it resolves on fresh checkouts (CI included). ESM imports are
# hoisted, so the config file cannot create the marker before importing it
# — it has to exist before astro loads the config, i.e. here. See
# scripts/refresh-local-trees.sh, which rewrites it on every refresh.
MARKER="$SCRIPT_DIR/local-trees-marker.mjs"
if [[ ! -f "$MARKER" ]]; then
  {
    echo "// Auto-generated bootstrap. See scripts/refresh-local-trees.sh."
    echo "export const LAST_REFRESH = '$(date -u +%Y-%m-%dT%H:%M:%SZ)';"
  } > "$MARKER"
fi

# Analysis projects to publish, one directory per project under
# $SRC/code-analysis/. Keep in sync with the sidebar groups in
# astro.config.mjs and the project sections in code-analysis/index.mdx.
PROJECTS=(cubrid postgres)

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: source $SRC not found" >&2
  echo "  Either clone knowledge-base alongside this repo, or pass" >&2
  echo "  SRC=/path/to/knowledge ./prebuild.sh" >&2
  exit 1
fi

COMMON_EXCLUDES=(
  --exclude='CLAUDE.md'
  --exclude='*_ko.md'
  --exclude='.omc/'
  --exclude='.claude/'
  --exclude='.meta/'
  --exclude='.obsidian/'
  --exclude='*.link'
)

DOCS_ONLY_FILTER=(
  --include='*/'
  --include='*.md'
  --include='*.pdf'
  --include='*.png'
  --include='*.jpg'
  --include='*.jpeg'
  --include='*.svg'
  --include='*.gif'
  --include='*.webp'
  --exclude='*'
)

# KO mirror of the local trees. cubrid_cv (and any other local tree that
# follows the vault's bilingual convention) colocates the Korean version of
# each doc as a foo_ko.md sibling, not in a separate ko/ source dir. The EN
# rsync uses COMMON_EXCLUDES, which drops every *_ko.md to keep the root tree
# English-only; this pair of filters does the inverse — keep only the *_ko.md
# markdown (plus shared figures) and drop the EN .md — so the loop can build a
# parallel ko/local/ tree. The _ko suffix is stripped after rsync (see below)
# so each ko/local/<dest>/<path>.md lines up slug-for-slug with its English
# sibling under local/<dest>, which is what Starlight i18n needs to pair them
# under the 한국어 locale. Same split the code-analysis trees use above.
KO_LOCAL_EXCLUDES=(
  --exclude='CLAUDE.md'
  --exclude='.omc/'
  --exclude='.claude/'
  --exclude='.meta/'
  --exclude='.obsidian/'
  --exclude='*.link'
)
KO_DOCS_FILTER=(
  --include='*/'
  --include='*_ko.md'
  --exclude='*.md'
  --include='*.pdf'
  --include='*.png'
  --include='*.jpg'
  --include='*.jpeg'
  --include='*.svg'
  --include='*.gif'
  --include='*.webp'
  --exclude='*'
)

for proj in "${PROJECTS[@]}"; do
  if [[ ! -d "$SRC/code-analysis/$proj" ]]; then
    echo "ERROR: $SRC/code-analysis/$proj not found in source" >&2
    exit 1
  fi

  EN_DEST="$SCRIPT_DIR/src/content/docs/code-analysis/$proj"
  KO_DEST="$SCRIPT_DIR/src/content/docs/ko/code-analysis/$proj"

  # Stash colocated PDFs (output of pdf-export/build-pdf.sh) so the
  # rm-and-rsync cycle does not blow them away. They live next to their
  # source md and are discovered by src/components/PageTitle.astro to
  # render Download buttons. See pdf-export/README.md.
  PDF_STASH="$(mktemp -d)"
  mkdir -p "$PDF_STASH/en" "$PDF_STASH/ko"
  if [[ -d "$EN_DEST" ]]; then
    find "$EN_DEST" -maxdepth 1 -name '*.pdf' -exec mv {} "$PDF_STASH/en/" \; 2>/dev/null || true
  fi
  if [[ -d "$KO_DEST" ]]; then
    find "$KO_DEST" -maxdepth 1 -name '*.pdf' -exec mv {} "$PDF_STASH/ko/" \; 2>/dev/null || true
  fi

  rm -rf "$EN_DEST" "$KO_DEST"
  mkdir -p "$EN_DEST" "$KO_DEST"

  echo ">> rsync EN: $SRC/code-analysis/$proj/ → $EN_DEST/"
  rsync -a "${COMMON_EXCLUDES[@]}" "$SRC/code-analysis/$proj/" "$EN_DEST/"

  if [[ -d "$SRC/ko/code-analysis/$proj" ]]; then
    echo ">> rsync KO: $SRC/ko/code-analysis/$proj/ → $KO_DEST/"
    # --copy-unsafe-links dereferences the KO .assets/ symlinks (they
    # point relative-up to the EN-tree assets) so the built site carries
    # real PNGs under ko/, not dangling links.
    rsync -a --copy-unsafe-links \
      "${COMMON_EXCLUDES[@]}" \
      "$SRC/ko/code-analysis/$proj/" "$KO_DEST/"

    # Self-heal missing KO figures. The KO mirror is expected to carry a
    # <doc>.assets symlink per EN <doc>.assets (dereferenced above). When a
    # KO doc is added without its symlink, its ![](<doc>.assets/...) refs
    # would 404 at astro build ("Could not find requested image ..."). Fill
    # any EN assets dir absent on the KO side by copying the real EN figures,
    # so the build never breaks on a source-side symlink gap.
    for en_assets in "$EN_DEST"/*.assets; do
      [[ -d "$en_assets" ]] || continue
      ko_assets="$KO_DEST/$(basename "$en_assets")"
      if [[ ! -d "$ko_assets" ]]; then
        echo ">> heal KO assets: $(basename "$en_assets") ← EN"
        cp -aL "$en_assets" "$ko_assets"
      fi
    done
  else
    echo "WARN: no $SRC/ko/code-analysis/$proj — skipping KO tree"
  fi

  # Restore the colocated PDFs that were stashed before the wipe.
  find "$PDF_STASH/en" -maxdepth 1 -name '*.pdf' -exec mv {} "$EN_DEST/" \; 2>/dev/null || true
  find "$PDF_STASH/ko" -maxdepth 1 -name '*.pdf' -exec mv {} "$KO_DEST/" \; 2>/dev/null || true
  rm -rf "$PDF_STASH"

  echo ">> sanitize frontmatter ($proj)"
  python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$EN_DEST"
  python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$KO_DEST"
done

# Local-only trees. Driven by ./local-trees.conf (gitignored, per-machine).
# Each entry: "<dest_under_local>|<abs_src>[|<comma_subdirs>]".
# Missing src dirs are skipped silently, so CI hosts (where the file is
# absent or paths don't exist) are unaffected.
LOCAL_ROOT="$SCRIPT_DIR/src/content/docs/local"
KO_LOCAL_ROOT="$SCRIPT_DIR/src/content/docs/ko/local"
rm -rf "$LOCAL_ROOT" "$KO_LOCAL_ROOT"

LOCAL_CONF="$SCRIPT_DIR/local-trees.conf"
if [[ -f "$LOCAL_CONF" ]]; then
  LOCAL_TREES=()
  # shellcheck source=/dev/null
  source "$LOCAL_CONF"
  for entry in "${LOCAL_TREES[@]}"; do
    IFS='|' read -r dest src subdirs <<< "$entry"
    if [[ -z "$dest" || -z "$src" ]]; then
      echo "WARN: malformed LOCAL_TREES entry: $entry" >&2
      continue
    fi
    if [[ ! -d "$src" ]]; then
      echo "skip LOCAL: $src not found"
      continue
    fi
    dest_full="$LOCAL_ROOT/$dest"
    ko_dest_full="$KO_LOCAL_ROOT/$dest"
    mkdir -p "$dest_full"
    if [[ -n "${subdirs:-}" ]]; then
      IFS=',' read -r -a sub_arr <<< "$subdirs"
      for sub in "${sub_arr[@]}"; do
        if [[ -d "$src/$sub" ]]; then
          mkdir -p "$dest_full/$sub"
          echo ">> rsync LOCAL $dest/$sub  ←  $src/$sub"
          rsync -a "${COMMON_EXCLUDES[@]}" "${DOCS_ONLY_FILTER[@]}" "$src/$sub/" "$dest_full/$sub/"
          mkdir -p "$ko_dest_full/$sub"
          rsync -a "${KO_LOCAL_EXCLUDES[@]}" "${KO_DOCS_FILTER[@]}" "$src/$sub/" "$ko_dest_full/$sub/"
        fi
      done
    else
      echo ">> rsync LOCAL $dest  ←  $src"
      rsync -a "${COMMON_EXCLUDES[@]}" "${DOCS_ONLY_FILTER[@]}" "$src/" "$dest_full/"
      mkdir -p "$ko_dest_full"
      rsync -a "${KO_LOCAL_EXCLUDES[@]}" "${KO_DOCS_FILTER[@]}" "$src/" "$ko_dest_full/"
    fi
    python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$dest_full"
    python3 "$SCRIPT_DIR/scripts/quote_list_items.py" "$dest_full"
    python3 "$SCRIPT_DIR/scripts/inject_title.py" "$dest_full"
    # For cub_sys / cubrid_cv, the sidebar shows filename stems instead of
    # the md title so readers can navigate by the same path they cite in
    # chat / commits / JIRA. Code-analysis subtrees keep their narrative
    # titles (handled inside the script).
    # Prefix match handles subdir-scoped dests like "cub_sys/roadmap" in
    # local-trees.conf.
    if [[ "$dest" == cub_sys* || "$dest" == cubrid_cv* ]]; then
      python3 "$SCRIPT_DIR/scripts/inject_sidebar_label.py" "$dest_full"
    fi

    # KO mirror: rename foo_ko.md → foo.md so the slug under ko/local/<dest>
    # matches its English sibling under local/<dest>; Starlight then pairs the
    # two under the 한국어 locale and the language switcher links them. Trees
    # with no *_ko.md siblings (e.g. cub_sys, knowledge-slides) leave an empty
    # ko_dest_full, which we drop so no stray locale dirs reach the build.
    find "$ko_dest_full" -type f -name '*_ko.md' -print0 \
      | while IFS= read -r -d '' f; do mv "$f" "${f%_ko.md}.md"; done
    ko_md_count=$(find "$ko_dest_full" -type f -name '*.md' 2>/dev/null | wc -l)
    if [[ "$ko_md_count" -gt 0 ]]; then
      python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$ko_dest_full"
      python3 "$SCRIPT_DIR/scripts/quote_list_items.py" "$ko_dest_full"
      python3 "$SCRIPT_DIR/scripts/inject_title.py" "$ko_dest_full"
      if [[ "$dest" == cub_sys* || "$dest" == cubrid_cv* ]]; then
        python3 "$SCRIPT_DIR/scripts/inject_sidebar_label.py" "$ko_dest_full"
      fi
    else
      rm -rf "$ko_dest_full"
    fi
  done
fi

en_count=$(find "$SCRIPT_DIR/src/content/docs/code-analysis" -type f -name '*.md' | wc -l)
ko_count=$(find "$SCRIPT_DIR/src/content/docs/ko/code-analysis" -type f -name '*.md' 2>/dev/null | wc -l || echo 0)
local_count=$(find "$LOCAL_ROOT" -type f -name '*.md' 2>/dev/null | wc -l || echo 0)
echo "prebuild: en=$en_count md, ko=$ko_count md, local=$local_count md"
