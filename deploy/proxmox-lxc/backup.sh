#!/usr/bin/env bash
# Teamflow backup: the database (SQLite online backup) and, optionally, uploaded files.
# Prints "BACKUP database <file>" / "BACKUP uploads <file>" lines that update.sh reads.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/teamflow}"
KEEP_DB_BACKUPS="${KEEP_DB_BACKUPS:-10}"
MODE="full"

usage() {
  cat <<'EOF'
Teamflow backup: database and optionally uploaded files.

Usage:
  teamflow-backup                 # database + uploads (manual default)
  teamflow-backup --full          # same as above
  teamflow-backup --db-only       # database only (fast; used by update)
  teamflow-backup --uploads-only  # uploaded files only

Backups go to /var/backups/teamflow. The newest 10 database backups are kept.
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
chmod 700 "$BACKUP_DIR"

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
  dest="$BACKUP_DIR/teamflow_$STAMP.db"
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

  # Keep the newest database backups only.
  local old
  while IFS= read -r old; do
    rm -f "$old"
  done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'teamflow_*.db' -printf '%T@ %p\n' | sort -rn |
    tail -n +"$((KEEP_DB_BACKUPS + 1))" | cut -d' ' -f2-)
}

backup_uploads() {
  local upload_dir
  upload_dir=$(env_value UPLOAD_DIR)
  upload_dir=$(resolve_path "${upload_dir:-./data/uploads}")
  if [[ ! -d "$upload_dir" ]]; then
    echo "No uploads directory at $upload_dir (skipped)."
    return 0
  fi
  local archive="$BACKUP_DIR/teamflow_uploads_$STAMP.tar.gz"
  echo "==> Uploads backup starting…"
  tar -czf "$archive" -C "$(dirname "$upload_dir")" "$(basename "$upload_dir")"
  chmod 600 "$archive"
  echo "BACKUP uploads $archive"
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
