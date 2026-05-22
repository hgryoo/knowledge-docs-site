#!/usr/bin/env bash
# Restart the knowledge-docs-site dev server (astro dev on :9998).
#
# Usage:
#   docs-site                 # restart (default)
#   docs-site start           # start if not running
#   docs-site stop            # stop without restarting
#   docs-site nuke            # stop + wipe .astro/ content cache + start
#   docs-site status          # show pid/port/log location
#   docs-site logs [-f]       # tail the log (add -f to follow)
#
# The server is detached via nohup + setsid so it survives shell exit.
# `nuke` is for when prebuild's rm+rsync cycle leaves .astro/data-store.json
# in a partial state and stale HTML is served even after a normal restart.
set -euo pipefail

PROJECT_DIR="/data/hgryoo/knowledge-docs-site"
PORT=9998
LOG_DIR="$HOME/.local/state/docs-site"
LOG_FILE="$LOG_DIR/dev.log"
PID_FILE="$LOG_DIR/dev.pid"

mkdir -p "$LOG_DIR"

is_alive() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

stop_server() {
  # Kill tracked PID's process group first.
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.3
      done
      kill -9 -- "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Sweep any stragglers bound to the port.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  fi
}

start_server() {
  if is_alive; then
    echo "docs-site already running (pid $(cat "$PID_FILE")) on :${PORT}"
    return 0
  fi
  cd "$PROJECT_DIR"
  echo "--- $(date -Iseconds) starting docs-site ---" >>"$LOG_FILE"
  # setsid → new session/process group so we can signal the whole tree.
  setsid nohup npm run dev >>"$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  echo "docs-site started (pid $pid) on http://localhost:${PORT}/"
  echo "logs: $LOG_FILE"
}

case "${1:-restart}" in
  start)   start_server ;;
  stop)    stop_server; echo "docs-site stopped" ;;
  restart|"") stop_server; start_server ;;
  nuke)
    stop_server
    echo "wiping $PROJECT_DIR/.astro/"
    rm -rf "$PROJECT_DIR/.astro"
    start_server
    ;;
  status)
    if is_alive; then
      echo "running (pid $(cat "$PID_FILE")) on :${PORT}"
    else
      echo "stopped"
    fi
    echo "log: $LOG_FILE"
    ;;
  logs)
    shift || true
    if [[ "${1:-}" == "-f" ]]; then
      tail -f "$LOG_FILE"
    else
      tail -n 100 "$LOG_FILE"
    fi
    ;;
  *)
    echo "usage: docs-site [start|stop|restart|nuke|status|logs [-f]]" >&2
    exit 2
    ;;
esac
