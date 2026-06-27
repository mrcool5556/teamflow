#!/usr/bin/env bash
# Read-only Teamflow server snapshot for remote debugging.
# Usage (from dev machine): ssh teamflow 'bash -s' < deploy/proxmox-lxc/diagnose.sh

set -euo pipefail

APP_DIR="${TEAMFLOW_APP_DIR:-/opt/teamflow}"

section() {
  echo ""
  echo "=== $1 ==="
}

section "host"
hostname
date -Is 2>/dev/null || date

section "systemd teamflow"
systemctl is-active teamflow 2>&1 || true
systemctl status teamflow --no-pager -l 2>&1 | head -25 || true

section "unit KillMode"
grep -E '^(ExecStart|KillMode|User|WorkingDirectory)=' /etc/systemd/system/teamflow.service 2>&1 || true

section "health"
if curl -sf --max-time 5 "http://127.0.0.1:3000/health" >/dev/null 2>&1; then
  curl -sS --max-time 5 "http://127.0.0.1:3000/health" || true
  echo ""
else
  echo "health endpoint unreachable on :3000"
fi

section "git (/opt/teamflow as teamflow user)"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u teamflow git -C "$APP_DIR" log -1 --oneline 2>&1 || true
  sudo -u teamflow git -C "$APP_DIR" status -sb 2>&1 | head -10 || true
  sudo -u teamflow git -C "$APP_DIR" fetch origin 2>&1 | tail -3 || true
  sudo -u teamflow git -C "$APP_DIR" rev-list --left-right --count HEAD...origin/main 2>&1 || true
else
  echo "no git repo at $APP_DIR"
fi

section "maintenance wrappers"
ls -la /usr/local/bin/teamflow-* 2>&1 || true

section "maintenance.log (last 40 lines)"
if [[ -f "$APP_DIR/data/maintenance.log" ]]; then
  tail -40 "$APP_DIR/data/maintenance.log"
else
  echo "(no $APP_DIR/data/maintenance.log)"
fi

section "journal (last 15 teamflow lines)"
journalctl -u teamflow -n 15 --no-pager 2>&1 || true

section "disk"
df -h "$APP_DIR" 2>&1 || df -h / 2>&1 || true
