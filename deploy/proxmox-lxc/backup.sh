#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/teamflow}"
STAMP=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if grep -q '^DATABASE_URL=postgresql' "$APP_DIR/.env" 2>/dev/null; then
  sudo -u postgres pg_dump teamflow > "$BACKUP_DIR/teamflow_$STAMP.sql"
  echo "PostgreSQL backup: $BACKUP_DIR/teamflow_$STAMP.sql"
elif [[ -f "$APP_DIR/data/teamflow.db" ]]; then
  cp "$APP_DIR/data/teamflow.db" "$BACKUP_DIR/teamflow_$STAMP.db"
  echo "SQLite backup: $BACKUP_DIR/teamflow_$STAMP.db"
  if [[ -d "$APP_DIR/data/uploads" ]]; then
    tar -czf "$BACKUP_DIR/teamflow_uploads_$STAMP.tar.gz" -C "$APP_DIR/data" uploads
    echo "Uploads backup: $BACKUP_DIR/teamflow_uploads_$STAMP.tar.gz"
  fi
else
  echo "No database found to backup."
  exit 1
fi
