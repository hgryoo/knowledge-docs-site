#!/usr/bin/env bash
# build-pdf.sh — Render a CUBRID code-analysis article from this docs-site
# into a CUBRID-styled PDF. Two visual tracks share the same Astro page;
# only the print stylesheet differs.
#
#   cubrid vibrant CUBRID-brand tone (tangram rainbow strip, navy h1
#          with red underline). Mirrors knowledge-slides decks.
#   doc    restrained technical-document tone (Biome / Knip neutral
#          palette, thin gray rule, book-like h1 page breaks).
#
# Per-PDF header/footer text is supplied via flags so the script never
# needs to be edited per request.
#
# Pipeline:
#   1. (npm run build) — Astro builds dist/ unless --skip-build.
#   2. astro preview spawned on a private port (default 9979).
#   3. node scripts/build-pdf.mjs runs Playwright against the preview.
#   4. PDF lands next to its source md, at
#      src/content/docs[/ko]/code-analysis/cubrid/<slug>.<track>.pdf.
#      src/components/PageTitle.astro then renders Download buttons on
#      the page. prebuild.sh stashes/restores these PDFs across rebuilds.
#
# Usage:
#   pdf-export/build-pdf.sh <slug> [options]
#
# Options:
#   --track {cubrid|doc|both}   default: both
#   --lang  {en|ko}             default: en
#   --header-left  "TEXT"       per-PDF header left text
#   --header-right "TEXT"       per-PDF header right text
#   --footer-left  "TEXT"       per-PDF footer left text
#   --footer-right "TEXT"       per-PDF footer right text
#   --port  N                   preview port (default 9979)
#   --skip-build                reuse existing dist/ from a prior build
#   --keep-preview              don't kill the preview server on exit
#   -h, --help                  show this help

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

SLUG=""
TRACK="both"
LANG="en"
HEADER_LEFT=""
HEADER_RIGHT=""
FOOTER_LEFT=""
FOOTER_RIGHT=""
PORT="9979"
SKIP_BUILD=0
KEEP_PREVIEW=0

usage() {
  sed -n '2,33p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --track)        TRACK="$2"; shift 2 ;;
    --lang)         LANG="$2"; shift 2 ;;
    --header-left)  HEADER_LEFT="$2"; shift 2 ;;
    --header-right) HEADER_RIGHT="$2"; shift 2 ;;
    --footer-left)  FOOTER_LEFT="$2"; shift 2 ;;
    --footer-right) FOOTER_RIGHT="$2"; shift 2 ;;
    --port)         PORT="$2"; shift 2 ;;
    --skip-build)   SKIP_BUILD=1; shift ;;
    --keep-preview) KEEP_PREVIEW=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    --*)            echo "Unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)              SLUG="$1"; shift ;;
  esac
done

if [[ -z "$SLUG" ]]; then
  echo "error: <slug> is required" >&2
  usage >&2
  exit 2
fi
case "$TRACK" in cubrid|doc|both) ;; *) echo "error: --track must be cubrid|doc|both" >&2; exit 2 ;; esac
case "$LANG"  in en|ko)           ;; *) echo "error: --lang must be en|ko" >&2; exit 2 ;; esac

cd "$REPO"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "→ astro build" >&2
  npm run build >&2
fi

# Start astro preview in the background; wait for it to listen.
PREVIEW_LOG="$(mktemp)"
echo "→ starting astro preview on 127.0.0.1:$PORT" >&2
npx astro preview --host 127.0.0.1 --port "$PORT" >"$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!

cleanup() {
  if [[ "$KEEP_PREVIEW" != "1" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  rm -f "$PREVIEW_LOG"
}
trap cleanup EXIT INT TERM

# Wait until the port accepts a TCP connection (max ~20s).
for _ in $(seq 1 40); do
  if (echo >/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then break; fi
  sleep 0.5
done
if ! (echo >/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
  echo "error: astro preview did not start on port $PORT" >&2
  echo "----- preview log -----" >&2
  cat "$PREVIEW_LOG" >&2
  exit 1
fi

run_track() {
  local t="$1"
  echo "→ rendering $SLUG ($LANG / $t)" >&2
  node "$HERE/scripts/build-pdf.mjs" \
    --slug "$SLUG" \
    --track "$t" \
    --lang "$LANG" \
    --base-url "http://127.0.0.1:$PORT" \
    --header-left  "$HEADER_LEFT" \
    --header-right "$HEADER_RIGHT" \
    --footer-left  "$FOOTER_LEFT" \
    --footer-right "$FOOTER_RIGHT"
}

case "$TRACK" in
  cubrid) run_track cubrid ;;
  doc)    run_track doc ;;
  both)   run_track cubrid; run_track doc ;;
esac

echo
if [[ "$LANG" == "ko" ]]; then
  OUT_DIR="$REPO/src/content/docs/ko/code-analysis/cubrid"
else
  OUT_DIR="$REPO/src/content/docs/code-analysis/cubrid"
fi
echo "PDF(s) colocated with md in $OUT_DIR/:" >&2
ls -la "$OUT_DIR/" 2>/dev/null | grep "$SLUG.*\.pdf$" || true
