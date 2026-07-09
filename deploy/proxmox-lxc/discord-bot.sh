#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
SERVICE_NAME="teamflow-discord"
SERVICE_SRC="$APP_DIR/deploy/proxmox-lxc/teamflow-discord.service"
SERVICE_DST="/etc/systemd/system/${SERVICE_NAME}.service"
BOT_ENV="$APP_DIR/data/discord-bot.env"
ROOT_ENV="$APP_DIR/.env"
LOG_FILE="$APP_DIR/data/discord-bot-service.log"

usage() {
  cat <<'EOF'
Teamflow Discord bot service (systemd).

Usage:
  discord-bot.sh status
  discord-bot.sh sync-env
  discord-bot.sh install
  discord-bot.sh enable
  discord-bot.sh restart
  discord-bot.sh stop

Environment:
  APP_DIR   Install root (default: /opt/teamflow)
  APP_USER  Service user (default: teamflow)
EOF
}

read_env_value() {
  local file=$1
  local key=$2
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
}

write_bot_env() {
  local teamflow_url
  local config_key

  teamflow_url="$(read_env_value "$BOT_ENV" TEAMFLOW_URL || true)"
  if [[ -z "${teamflow_url:-}" ]]; then
    teamflow_url="$(read_env_value "$ROOT_ENV" TEAMFLOW_URL || true)"
  fi
  if [[ -z "${teamflow_url:-}" ]]; then
    teamflow_url="$(read_env_value "$ROOT_ENV" PUBLIC_URL || true)"
  fi
  if [[ -z "${teamflow_url:-}" ]]; then
    teamflow_url="http://127.0.0.1:3000"
  fi

  config_key="$(read_env_value "$ROOT_ENV" TEAMFLOW_BOT_CONFIG_KEY || true)"
  if [[ -z "${config_key:-}" ]]; then
    echo "TEAMFLOW_BOT_CONFIG_KEY is missing from $ROOT_ENV — save bot credentials in Teamflow Settings first." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$BOT_ENV")"
  cat >"$BOT_ENV" <<EOF
TEAMFLOW_URL=${teamflow_url}
TEAMFLOW_BOT_CONFIG_KEY=${config_key}
EOF
  chown "$APP_USER:$APP_USER" "$BOT_ENV"
  chmod 600 "$BOT_ENV"
}

install_unit() {
  if [[ ! -f "$SERVICE_SRC" ]]; then
    echo "Service template missing: $SERVICE_SRC" >&2
    exit 1
  fi

  sed "s|/opt/teamflow|${APP_DIR}|g" "$SERVICE_SRC" >"$SERVICE_DST"
  systemctl daemon-reload
}

unit_installed() {
  [[ -f "$SERVICE_DST" ]]
}

unit_enabled() {
  systemctl is-enabled "$SERVICE_NAME" &>/dev/null
}

service_active() {
  systemctl is-active "$SERVICE_NAME" &>/dev/null
}

process_running() {
  pgrep -af "node.*${APP_DIR}/apps/discord-bot/dist" >/dev/null 2>&1
}

log_tail() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -c 4000 "$LOG_FILE" 2>/dev/null || true
  fi
}

cmd_status() {
  local state="unknown"
  local unit_installed_flag=false
  local unit_enabled_flag=false
  local process_flag=false
  local bot_env_ready=false

  if unit_installed; then unit_installed_flag=true; fi
  if unit_enabled; then unit_enabled_flag=true; fi
  if process_running; then process_flag=true; fi
  if [[ -f "$BOT_ENV" ]]; then bot_env_ready=true; fi

  if [[ "$unit_installed_flag" == false ]]; then
    state="not_installed"
  elif service_active; then
    state="running"
  elif [[ "$process_flag" == true ]]; then
    state="running"
  elif systemctl is-failed "$SERVICE_NAME" &>/dev/null; then
    state="failed"
  else
    state="stopped"
  fi

  python3 - "$unit_installed_flag" "$unit_enabled_flag" "$state" "$process_flag" "$bot_env_ready" "$LOG_FILE" <<'PY'
import json
import pathlib
import sys

unit_installed = sys.argv[1] == "true"
unit_enabled = sys.argv[2] == "true"
state = sys.argv[3]
process_running = sys.argv[4] == "true"
bot_env_ready = sys.argv[5] == "true"
log_path = pathlib.Path(sys.argv[6])
log_tail = ""
if log_path.exists():
    log_tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]

print(json.dumps({
    "unitInstalled": unit_installed,
    "unitEnabled": unit_enabled,
    "state": state,
    "processRunning": process_running,
    "botEnvReady": bot_env_ready,
    "lastLogTail": log_tail,
}))
PY
}

cmd_enable() {
  write_bot_env
  install_unit
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  {
    echo "==> Discord bot enabled at $(date -Is)"
    systemctl status "$SERVICE_NAME" --no-pager || true
  } >>"$LOG_FILE" 2>&1 || true
  cmd_status
}

cmd_restart() {
  write_bot_env
  if ! unit_installed; then
    install_unit
  fi
  systemctl restart "$SERVICE_NAME"
  {
    echo "==> Discord bot restarted at $(date -Is)"
    systemctl status "$SERVICE_NAME" --no-pager || true
  } >>"$LOG_FILE" 2>&1 || true
  cmd_status
}

cmd_stop() {
  if unit_installed; then
    systemctl stop "$SERVICE_NAME" || true
  fi
  cmd_status
}

main() {
  local cmd="${1:---help}"
  case "$cmd" in
    --help | -h) usage ;;
    status) cmd_status ;;
    sync-env) write_bot_env ;;
    install) install_unit ;;
    enable) cmd_enable ;;
    restart) cmd_restart ;;
    stop) cmd_stop ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
