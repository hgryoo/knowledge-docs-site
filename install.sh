#!/usr/bin/env bash
# One-time setup for knowledge-docs-site:
#  - check prerequisites (node 22+, npm, python3, rsync)
#  - npm install
#  - prebuild content from the sibling knowledge-base/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

err=0

check_cmd() {
  local cmd="$1" hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "MISSING: $cmd"
    echo "  -> $hint"
    err=1
  else
    echo "OK     : $cmd ($("$cmd" --version 2>/dev/null | head -1))"
  fi
}

echo "Checking prerequisites..."
check_cmd node    "install Node.js >=22 (recommended: nvm install 22)"
check_cmd npm     "ships with Node.js"
check_cmd python3 "install python3 (sudo apt install python3)"
check_cmd rsync   "install rsync   (sudo apt install rsync)"

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( node_major < 20 )); then
    echo "MISSING: Node.js >=20 (current: $(node -v))"
    err=1
  fi
fi

if (( err )); then
  echo
  echo "Install the missing prerequisites above and re-run ./install.sh"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo "→ npm install"
  npm install
fi

SIBLING="$SCRIPT_DIR/../knowledge-base/knowledge"
if [[ ! -d "$SIBLING" ]]; then
  echo
  echo "WARNING: expected sibling content tree at $SIBLING — not found."
  echo "  Either clone knowledge-base alongside this repo, or set SRC=... when"
  echo "  invoking prebuild.sh / npm run refresh."
else
  echo
  echo "→ prebuild content from $SIBLING"
  bash ./prebuild.sh
fi

echo
echo "Done. Run:  npm run dev   # http://localhost:9998"
echo "When the kb changes:  npm run refresh"
