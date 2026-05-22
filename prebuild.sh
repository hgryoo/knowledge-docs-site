#!/usr/bin/env bash
# Materialize the analysis-doc trees from the sibling knowledge-base/ repo
# into src/content/docs/(en|ko)/code-analysis/cubrid, then sanitize
# frontmatter so js-yaml's strict parse accepts every file.
#
# Source layout (kb side):
#   $SRC/code-analysis/cubrid/<doc>.md          — English (primary)
#   $SRC/code-analysis/cubrid/<doc>.assets/     — figures
#   $SRC/ko/code-analysis/cubrid/<doc>.md       — Korean mirror
#   $SRC/ko/code-analysis/cubrid/<doc>.assets/  — symlinks → EN assets
#
# Site layout (this side):
#   src/content/docs/code-analysis/cubrid/...    — EN (root locale)
#   src/content/docs/ko/code-analysis/cubrid/... — KO
#
# Override SRC=... to point at a different kb checkout (used in CI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SRC:-$SCRIPT_DIR/../knowledge-base/knowledge}"
EN_DEST="$SCRIPT_DIR/src/content/docs/code-analysis/cubrid"
KO_DEST="$SCRIPT_DIR/src/content/docs/ko/code-analysis/cubrid"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: source $SRC not found" >&2
  echo "  Either clone knowledge-base alongside this repo, or pass" >&2
  echo "  SRC=/path/to/knowledge ./prebuild.sh" >&2
  exit 1
fi

if [[ ! -d "$SRC/code-analysis/cubrid" ]]; then
  echo "ERROR: $SRC/code-analysis/cubrid not found in source" >&2
  exit 1
fi

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

COMMON_EXCLUDES=(
  --exclude='CLAUDE.md'
  --exclude='*_ko.md'
  --exclude='.omc/'
  --exclude='.claude/'
  --exclude='.meta/'
  --exclude='.obsidian/'
  --exclude='*.link'
)

echo ">> rsync EN: $SRC/code-analysis/cubrid/ → $EN_DEST/"
rsync -a "${COMMON_EXCLUDES[@]}" "$SRC/code-analysis/cubrid/" "$EN_DEST/"

if [[ -d "$SRC/ko/code-analysis/cubrid" ]]; then
  echo ">> rsync KO: $SRC/ko/code-analysis/cubrid/ → $KO_DEST/"
  # --copy-unsafe-links dereferences the KO .assets/ symlinks (they
  # point relative-up to the EN-tree assets) so the built site carries
  # real PNGs under ko/, not dangling links.
  rsync -a --copy-unsafe-links \
    "${COMMON_EXCLUDES[@]}" \
    "$SRC/ko/code-analysis/cubrid/" "$KO_DEST/"
else
  echo "WARN: no $SRC/ko/code-analysis/cubrid — skipping KO tree"
fi

# Restore the colocated PDFs that were stashed before the wipe.
find "$PDF_STASH/en" -maxdepth 1 -name '*.pdf' -exec mv {} "$EN_DEST/" \; 2>/dev/null || true
find "$PDF_STASH/ko" -maxdepth 1 -name '*.pdf' -exec mv {} "$KO_DEST/" \; 2>/dev/null || true
rm -rf "$PDF_STASH"

echo ">> sanitize frontmatter"
python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$EN_DEST"
python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$KO_DEST"

# Local-only trees. Driven by ./local-trees.conf (gitignored, per-machine).
# Each entry: "<dest_under_local>|<abs_src>[|<comma_subdirs>]".
# Missing src dirs are skipped silently, so CI hosts (where the file is
# absent or paths don't exist) are unaffected.
LOCAL_ROOT="$SCRIPT_DIR/src/content/docs/local"
rm -rf "$LOCAL_ROOT"

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
    mkdir -p "$dest_full"
    if [[ -n "${subdirs:-}" ]]; then
      IFS=',' read -r -a sub_arr <<< "$subdirs"
      for sub in "${sub_arr[@]}"; do
        if [[ -d "$src/$sub" ]]; then
          mkdir -p "$dest_full/$sub"
          echo ">> rsync LOCAL $dest/$sub  ←  $src/$sub"
          rsync -a "${COMMON_EXCLUDES[@]}" "$src/$sub/" "$dest_full/$sub/"
        fi
      done
    else
      echo ">> rsync LOCAL $dest  ←  $src"
      rsync -a "${COMMON_EXCLUDES[@]}" "$src/" "$dest_full/"
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
  done
fi

en_count=$(find "$EN_DEST" -type f -name '*.md' | wc -l)
ko_count=$(find "$KO_DEST" -type f -name '*.md' 2>/dev/null | wc -l || echo 0)
local_count=$(find "$LOCAL_ROOT" -type f -name '*.md' 2>/dev/null | wc -l || echo 0)
echo "prebuild: en=$en_count md, ko=$ko_count md, local=$local_count md"
