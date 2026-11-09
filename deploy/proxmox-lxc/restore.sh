#!/usr/bin/env bash
# Teamflow restore: put a database backup back.
#
#   sudo teamflow-restore --file teamflow_2026-11-12_140201.db
#
# Backs up the current database first (so a restore can itself be undone), stops the service,
# swaps the chosen backup in, starts the service and waits for it to answer.
# Log lines for Settings → Updates: STEP <backup|restore|restart|check>, FAIL <code> <message>,
# RESTORED <file>.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
SERVICE="teamflow"
BACKUP_DIR="/var/backups/teamflow"
SYSTEMCTL="systemctl"
# Overrides for tests; ignored when the app user runs this through sudo.
if [[ "${SUDO_USER:-}" != "$APP_USER" ]]; then
  BACKUP_DIR="${BACKUP_DIR_OVERRIDE:-$BACKUP_DIR}"
  SYSTEMCTL="${TEAMFLOW_SYSTEMCTL:-systemctl}"
fi

usage() {
  cat <<'EOF'
Teamflow restore: put a database backup back.

Usage:
  sudo teamflow-restore --file NAME   # a file in /var/backups/teamflow, e.g. teamflow_2026-11-12_140201.db

The current database is backed up first, so a restore can be undone the same way.
EOF
}

NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) NAME="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "FAIL usage Unknown option: $1"; usage; exit 2 ;;
  esac
done

# Only a plain backup file name: no paths, nothing outside the backup folder.
if [[ ! "$NAME" =~ ^teamflow_[A-Za-z0-9_.-]+\.db$ ]]; then
  echo "FAIL usage Pass --file with a database backup name such as teamflow_2026-11-12_140201.db"
  exit 2
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo teamflow-restore --file $NAME"
  exit 1
fi

LOG_FILE="$APP_DIR/data/maintenance.log"
mkdir -p "$APP_DIR/data"
touch "$LOG_FILE"
chown "$APP_USER:$APP_USER" "$LOG_FILE" 2>/dev/null || true
if [[ -t 1 ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
else
  exec >>"$LOG_FILE" 2>&1
fi

echo ""
echo "==> Teamflow restore $(date -Is): $NAME"

exec 9>"$APP_DIR/data/.update.lock"
if ! flock -n 9; then
  echo "FAIL busy An update or restore is already running."
  exit 1
fi

SOURCE="$BACKUP_DIR/$NAME"
if [[ ! -f "$SOURCE" ]]; then
  echo "FAIL usage No backup named $NAME in $BACKUP_DIR."
  exit 1
fi
if [[ "$(head -c 15 "$SOURCE")" != "SQLite format 3" ]]; then
  echo "FAIL checksum $NAME is not a SQLite database; nothing was changed."
  exit 1
fi

db_path() {
  local url
  url=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')
  url="${url#file:}"
  url="${url:-./data/teamflow.db}"
  if [[ "$url" != /* ]]; then url="$APP_DIR/${url#./}"; fi
  echo "$url"
}

port() {
  local p
  p=$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '"'"'"' ')
  echo "${p:-3000}"
}

svc() {
  "$SYSTEMCTL" "$@" 9>&-
}

echo "STEP backup"
BACKUP_SCRIPT="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/backup.sh"
if ! BACKUP_DIR="$BACKUP_DIR" bash "$BACKUP_SCRIPT" --db-only; then
  echo "FAIL unknown Couldn't back up the current database first, so nothing was changed."
  exit 1
fi

echo "STEP restore"
DB="$(db_path)"
svc stop "$SERVICE"
cp "$SOURCE" "$DB.restore"
rm -f "$DB-wal" "$DB-shm"
mv -f "$DB.restore" "$DB"
chown "$APP_USER:$APP_USER" "$DB"
chmod 600 "$DB"
echo "==> $NAME is now the database."

echo "STEP restart"
svc start "$SERVICE"

echo "STEP check"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$(port)/health" >/dev/null 2>&1; then
    echo "RESTORED $NAME"
    exit 0
  fi
  sleep 1
done
echo "FAIL health Teamflow did not answer within 60 seconds after the restore. See journalctl -u teamflow -n 50."
exit 1
