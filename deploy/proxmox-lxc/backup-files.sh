#!/usr/bin/env bash
# Teamflow backup folder housekeeping, run as root (installed to /usr/local/lib/teamflow by
# setup-maintenance-sudo.sh; the app calls it through sudo).
#
#   backup-files.sh prune database|uploads   delete the oldest automatic backups beyond the
#                                            keep setting (backup.sh runs this after a backup)
#   backup-files.sh delete <name>            delete one backup (Server admin -> Backups)
#
# Only Teamflow's own automatic names are ever pruned:
#   teamflow_YYYY-MM-DD_HHMMSS[-N].db            database backups
#   teamflow_uploads_YYYY-MM-DD_HHMMSS[-N].tar.gz upload archives
# Other teamflow* files (teamflow-pre-*, teamflow_db_pre-*, *-before-releases.db,
# teamflow_env_pre-*) are checkpoints: never pruned and not counted; delete removes them only
# when asked by name. Nothing else in the folder is touched. The newest database backup is
# never deleted.
#
# The keep settings come from $APP_DIR/data/backup-settings.json (written by the app):
#   {"keepDatabaseBackups": 10, "keepUploadArchives": 1}   each 1-100; anything else = default
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/teamflow}"
SETTINGS="$APP_DIR/data/backup-settings.json"
DB_RE='^teamflow_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}(-[0-9]+)?\.db$'
UPLOADS_RE='^teamflow_uploads_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}(-[0-9]+)?\.tar\.gz$'
LISTED_RE='^teamflow[A-Za-z0-9_.-]*$'

usage() {
  cat <<'EOF'
Teamflow backup folder housekeeping (run as root).

Usage:
  backup-files.sh prune database|uploads
  backup-files.sh delete <backup file name>
  backup-files.sh keep database|uploads     print the keep setting in use

Keep settings: /opt/teamflow/data/backup-settings.json, set in Server admin.
EOF
}

# keep_setting <json key> <default>: an integer 1-100 from the settings file, else the default.
# The file belongs to the app user, so it is only ever read as two numbers.
keep_setting() {
  local key=$1 default=$2 v=""
  if [[ -f "$SETTINGS" && ! -L "$SETTINGS" ]]; then
    v=$(head -c 4096 "$SETTINGS" | tr -d '\r\n' |
      sed -nE "s/.*\"$key\"[[:space:]]*:[[:space:]]*([0-9]{1,3})[^0-9].*/\1/p" || true)
  fi
  if [[ "$v" =~ ^[0-9]{1,3}$ ]] && ((10#$v >= 1 && 10#$v <= 100)); then
    echo $((10#$v))
  else
    echo "$default"
  fi
}

keep_for() {
  case "$1" in
    database) keep_setting keepDatabaseBackups 10 ;;
    uploads) keep_setting keepUploadArchives 1 ;;
    *) echo "FAIL usage type must be database or uploads"; exit 2 ;;
  esac
}

# auto_files <regex>: matching regular files (no links) directly in the folder, newest first.
auto_files() {
  local re=$1 line name
  [[ -d "$BACKUP_DIR" ]] || return 0
  while IFS= read -r line; do
    name=${line#* }
    [[ "$name" =~ $re ]] && printf '%s\n' "$name"
  done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type f -printf '%T@ %f\n' | sort -rn)
}

newest_database() {
  auto_files "$DB_RE" | head -n1
}

prune() {
  local type=$1 keep re name
  keep=$(keep_for "$type")
  if [[ "$type" == database ]]; then re=$DB_RE; else re=$UPLOADS_RE; fi
  while IFS= read -r name; do
    rm -f -- "${BACKUP_DIR:?}/$name"
    echo "PRUNED $type $name"
  done < <(auto_files "$re" | tail -n +"$((keep + 1))")
}

delete_one() {
  local name=$1
  if [[ ! "$name" =~ $LISTED_RE || "$name" == *..* ]]; then
    echo "FAIL usage Not a Teamflow backup name: $name"
    exit 2
  fi
  local path="$BACKUP_DIR/$name"
  if [[ -L "$path" || ! -f "$path" ]]; then
    echo "FAIL missing No backup named $name"
    exit 1
  fi
  if [[ "$name" =~ $DB_RE && "$name" == "$(newest_database)" ]]; then
    echo "FAIL newest The newest database backup can't be deleted."
    exit 2
  fi
  rm -f -- "$path"
  echo "DELETED $name"
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

case "${1:-}" in
  prune) prune "${2:-}" ;;
  delete) [[ -n "${2:-}" ]] || { usage; exit 2; }; delete_one "$2" ;;
  keep) keep_for "${2:-}" ;;
  *) usage; exit 2 ;;
esac
