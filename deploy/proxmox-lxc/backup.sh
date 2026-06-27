#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/teamflow}"
MODE="full"

usage() {
  cat <<'EOF'
Teamflow backup — database and optionally uploaded files.

Usage:
  teamflow-backup              # database + uploads (manual default)
  teamflow-backup --full       # same as above
  teamflow-backup --db-only    # database only (fast; used by update)

Options:
  --full      Back up database and uploads
  --db-only   Back up database only — skips uploads
  -h, --help  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      MODE="full"
      shift
      ;;
    --db-only)
      MODE="db-only"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

STAMP=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

resolve_upload_dir() {
  local upload_dir="$APP_DIR/data/uploads"
  if [[ -f "$APP_DIR/.env" ]]; then
    local configured
    configured=$(grep -E '^UPLOAD_DIR=' "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
    if [[ -n "$configured" ]]; then
      upload_dir="$configured"
    fi
  fi
  printf '%s' "$upload_dir"
}

backup_uploads() {
  local upload_dir
  upload_dir=$(resolve_upload_dir)
  if [[ ! -d "$upload_dir" ]]; then
    echo "No uploads directory at $upload_dir (skipped)."
    return 0
  fi
  local archive="$BACKUP_DIR/teamflow_uploads_$STAMP.tar.gz"
  tar -czf "$archive" -C "$(dirname "$upload_dir")" "$(basename "$upload_dir")"
  echo "Uploads backup: $archive"
}

if grep -q '^DATABASE_URL=postgresql' "$APP_DIR/.env" 2>/dev/null; then
  echo "==> PostgreSQL backup starting (pg_dump teamflow)…"
  sudo -u postgres pg_dump teamflow > "$BACKUP_DIR/teamflow_$STAMP.sql"
  echo "PostgreSQL backup: $BACKUP_DIR/teamflow_$STAMP.sql"
  if [[ "$MODE" == "full" ]]; then
    backup_uploads
  else
    echo "Uploads skipped (use teamflow-backup --full to include)."
  fi
elif [[ -f "$APP_DIR/data/teamflow.db" ]]; then
  echo "==> SQLite backup starting…"
  cp "$APP_DIR/data/teamflow.db" "$BACKUP_DIR/teamflow_$STAMP.db"
  echo "SQLite backup: $BACKUP_DIR/teamflow_$STAMP.db"
  if [[ "$MODE" == "full" ]]; then
    backup_uploads
  else
    echo "Uploads skipped (use teamflow-backup --full to include)."
  fi
else
  echo "No database found to backup."
  exit 1
fi
