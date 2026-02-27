#!/usr/bin/env bash
set -euo pipefail

APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8787}"
APP_URL="http://localhost:${APP_PORT}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${REPO_DIR}/.venv"

log() {
  printf '[mini-kbd] %s\n' "$*"
}

fail() {
  printf '[mini-kbd] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

ensure_python() {
  require_cmd python3
  if ! python3 - <<'PY'
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
  then
    fail "Python 3.11+ is required. Found: $(python3 -V 2>&1)"
  fi
}

ensure_brew_package() {
  local package="$1"
  if brew list --versions "$package" >/dev/null 2>&1; then
    log "Homebrew package already installed: $package"
  else
    log "Installing Homebrew package: $package"
    brew install "$package"
  fi
}

ensure_native_deps() {
  if command -v brew >/dev/null 2>&1; then
    ensure_brew_package hidapi
    ensure_brew_package libusb
  else
    log "Homebrew not found; skipping hidapi/libusb auto-install."
    log "If install fails, install Homebrew then run: brew install hidapi libusb"
  fi
}

setup_venv() {
  if [[ ! -d "${VENV_DIR}" ]]; then
    log "Creating virtual environment at ${VENV_DIR}"
    python3 -m venv "${VENV_DIR}"
  fi

  cd "${REPO_DIR}"
  # shellcheck disable=SC1090
  source "${VENV_DIR}/bin/activate"
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt
}

check_port_free() {
  if lsof -nP -iTCP:"${APP_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port ${APP_PORT} is already in use. Stop the other process or run with APP_PORT=<port> ./run-mac.sh"
  fi
}

wait_for_server() {
  local status_url="http://${APP_HOST}:${APP_PORT}/api/status"
  for _ in $(seq 1 100); do
    if curl -fsS "${status_url}" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      return 1
    fi
    sleep 0.1
  done
  return 1
}

start_server() {
  cd "${REPO_DIR}"

  local -a uvicorn_args=(backend.main:app --host "${APP_HOST}" --port "${APP_PORT}")
  if [[ "${UVICORN_RELOAD:-0}" == "1" ]]; then
    uvicorn_args+=(--reload)
  fi

  log "Starting server on ${APP_HOST}:${APP_PORT}"
  python -m uvicorn "${uvicorn_args[@]}" &
  SERVER_PID=$!

  if wait_for_server; then
    if [[ "${NO_BROWSER:-0}" != "1" ]]; then
      log "Opening browser: ${APP_URL}"
      if command -v open >/dev/null 2>&1; then
        open "${APP_URL}"
      else
        log "Could not find 'open' command; browse to ${APP_URL} manually."
      fi
    fi
    log "Server is running. Press Ctrl+C to stop."
  else
    fail "Server failed to start. Check logs above for details."
  fi

  wait "${SERVER_PID}"
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

main() {
  require_cmd curl
  ensure_python
  ensure_native_deps
  setup_venv
  check_port_free
  start_server
}

main "$@"
