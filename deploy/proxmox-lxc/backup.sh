#!/usr/bin/env bash
# Teamflow backup: the database (SQLite online backup) and, optionally, uploaded files.
# Prints "BACKUP database <file>" / "BACKUP uploads <file>" lines that update.sh reads.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/teamflow}"
MODE="full"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Teamflow backup: database and optionally uploaded files.

Usage:
  teamflow-backup                 # database + uploads (manual default)
  teamflow-backup --full          # same as above
  teamflow-backup --db-only       # database only (fast; used by update)
  teamflow-backup --uploads-only  # uploaded files only

Backups go to /var/backups/teamflow. After each backup the oldest automatic backups beyond the
keep settings (Server admin; default 10 database backups, 1 upload archive) are deleted.
Named checkpoints (teamflow-pre-*, *-before-releases.db, ...) are never deleted.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) MODE="full"; shift ;;
    --db-only) MODE="db-only"; shift ;;
    --uploads-only) MODE="uploads-only"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo teamflow-backup"
  exit 1
fi

STAMP=$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
# The app user may list the folder (names and sizes for Server admin) but not read the files
# (each is 600) or change it; deleting goes through backup-files.sh as root.
chown "root:$APP_USER" "$BACKUP_DIR" 2>/dev/null || true
chmod 750 "$BACKUP_DIR"

prune() {
  local tool="$SCRIPT_DIR/backup-files.sh"
  if [[ ! -f "$tool" ]]; then
    echo "Old backups not pruned: $tool is missing."
    return 0
  fi
  APP_DIR="$APP_DIR" BACKUP_DIR="$BACKUP_DIR" bash "$tool" prune "$1"
}

env_value() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'" | xargs || true
}

resolve_path() {
  local value=$1
  if [[ "$value" != /* ]]; then value="$APP_DIR/${value#./}"; fi
  printf '%s' "$value"
}

db_path() {
  local url
  url=$(env_value DATABASE_URL)
  url="${url#file:}"
  resolve_path "${url:-./data/teamflow.db}"
}

backup_database() {
  local db dest
  db=$(db_path)
  if [[ ! -f "$db" ]]; then
    echo "No database found at $db"
    exit 1
  fi
  # Never overwrite: two backups in the same second (a restore right after a backup) get -2, -3…
  dest="$BACKUP_DIR/teamflow_$STAMP.db"
  local n=2
  while [[ -e "$dest" ]]; do
    dest="$BACKUP_DIR/teamflow_${STAMP}-$n.db"
    n=$((n + 1))
  done
  echo "==> Database backup starting…"
  # A release install has a root-owned backup tool that uses SQLite's online backup, which is
  # safe while the server runs. A git checkout is owned by the app user, so root must not run
  # its code; it gets a plain copy instead.
  local tool="$APP_DIR/current/apps/server/dist/backup-db.js"
  if [[ -L "$APP_DIR/current" && -f "$tool" ]]; then
    (cd "$APP_DIR" && node "$tool" "$dest" >/dev/null)
  else
    cp "$db" "$dest"
  fi
  chmod 600 "$dest"
  echo "BACKUP database $dest"
  prune database
}

backup_uploads() {
  local upload_dir
  upload_dir=$(env_value UPLOAD_DIR)
  upload_dir=$(resolve_path "${upload_dir:-./data/uploads}")
  if [[ ! -d "$upload_dir" ]]; then
    echo "No uploads directory at $upload_dir (skipped)."
    return 0
  fi
  local archive="$BACKUP_DIR/teamflow_uploads_$STAMP.tar.gz" n=2
  while [[ -e "$archive" ]]; do
    archive="$BACKUP_DIR/teamflow_uploads_${STAMP}-$n.tar.gz"
    n=$((n + 1))
  done
  echo "==> Uploads backup starting…"
  tar -czf "$archive" -C "$(dirname "$upload_dir")" "$(basename "$upload_dir")"
  chmod 600 "$archive"
  echo "BACKUP uploads $archive"
  prune uploads
}

case "$MODE" in
  full)
    backup_database
    backup_uploads
    ;;
  db-only)
    backup_database
    echo "Uploads skipped (use teamflow-backup --full to include)."
    ;;
  uploads-only)
    backup_uploads
    ;;
esac
