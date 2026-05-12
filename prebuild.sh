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

rm -rf "$EN_DEST" "$KO_DEST"
mkdir -p "$EN_DEST" "$KO_DEST"

COMMON_EXCLUDES=(
  --exclude='CLAUDE.md'
  --exclude='*_ko.md'
  --exclude='.omc/'
  --exclude='.claude/'
  --exclude='.meta/'
  --exclude='.obsidian/'
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

echo ">> sanitize frontmatter"
python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$EN_DEST"
python3 "$SCRIPT_DIR/scripts/sanitize_frontmatter.py" "$KO_DEST"

en_count=$(find "$EN_DEST" -type f -name '*.md' | wc -l)
ko_count=$(find "$KO_DEST" -type f -name '*.md' 2>/dev/null | wc -l || echo 0)
echo "prebuild: en=$en_count md, ko=$ko_count md"
