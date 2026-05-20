#!/usr/bin/env bash
# Install (or uninstall) a post-commit hook in each src repo listed in
# local-trees.conf. The hook spawns scripts/refresh-local-trees.sh in
# the background so the commit returns immediately.
#
# Usage:
#   bash scripts/install-local-hooks.sh           # install / re-install
#   bash scripts/install-local-hooks.sh --status  # list current state
#   bash scripts/install-local-hooks.sh --remove  # uninstall ours only
#
# Idempotent: re-running install rewrites the hook to point at the
# current absolute path of refresh-local-trees.sh. Uninstall only
# touches hooks whose marker line matches ours (foreign hooks are left
# alone).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$HERE/local-trees.conf"
REFRESH="$HERE/scripts/refresh-local-trees.sh"
MARKER="# knowledge-docs-site: local-trees refresh hook"

mode="install"
case "${1:-}" in
  --status) mode="status" ;;
  --remove) mode="remove" ;;
  "") ;;
  *) echo "unknown arg: $1" >&2; exit 2 ;;
esac

if [[ ! -f "$CONF" ]]; then
  echo "ERROR: $CONF not found. Copy local-trees.conf.example first." >&2
  exit 1
fi

if [[ "$mode" == "install" && ! -x "$REFRESH" ]]; then
  chmod +x "$REFRESH"
fi

LOCAL_TREES=()
# shellcheck source=/dev/null
source "$CONF"

# Collect unique repo roots (one entry per repo even if conf lists
# multiple subdirs of it).
declare -A seen=()
roots=()
for entry in "${LOCAL_TREES[@]}"; do
  IFS='|' read -r _dest src _subdirs <<< "$entry"
  [[ -d "$src" ]] || continue
  root=$(git -C "$src" rev-parse --show-toplevel 2>/dev/null || true)
  [[ -n "$root" ]] || continue
  if [[ -z "${seen[$root]:-}" ]]; then
    seen[$root]=1
    roots+=("$root")
  fi
done

if [[ ${#roots[@]} -eq 0 ]]; then
  echo "no git repos discovered from $CONF"
  exit 0
fi

write_hook() {
  local hook="$1"
  cat >"$hook" <<EOF
#!/usr/bin/env bash
$MARKER
# Edit local-trees.conf in knowledge-docs-site to change which trees
# this triggers, or run scripts/install-local-hooks.sh --remove to
# uninstall.
nohup bash "$REFRESH" "post-commit:\$(pwd)" >/dev/null 2>&1 &
disown 2>/dev/null || true
exit 0
EOF
  chmod +x "$hook"
}

for root in "${roots[@]}"; do
  rel_hooks=$(git -C "$root" rev-parse --git-path hooks)
  if [[ "$rel_hooks" = /* ]]; then
    hooks_dir="$rel_hooks"
  else
    hooks_dir="$root/$rel_hooks"
  fi
  mkdir -p "$hooks_dir"
  hook="$hooks_dir/post-commit"
  case "$mode" in
    install)
      if [[ -f "$hook" && ! $(grep -F "$MARKER" "$hook" 2>/dev/null) ]]; then
        backup="$hook.bak.$(date +%s)"
        echo "BACKUP: existing foreign hook → $backup"
        cp "$hook" "$backup"
      fi
      write_hook "$hook"
      echo "INSTALLED: $hook"
      ;;
    remove)
      if [[ -f "$hook" ]] && grep -qF "$MARKER" "$hook"; then
        rm "$hook"
        echo "REMOVED:   $hook"
      else
        echo "SKIPPED:   $hook (not ours, or absent)"
      fi
      ;;
    status)
      if [[ -f "$hook" ]] && grep -qF "$MARKER" "$hook"; then
        echo "PRESENT:   $hook"
      elif [[ -f "$hook" ]]; then
        echo "FOREIGN:   $hook (some other hook is installed)"
      else
        echo "ABSENT:    $hook"
      fi
      ;;
  esac
done
