#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
BACKUP_SCRIPT="$APP_DIR/deploy/proxmox-lxc/backup.sh"
SKIP_BACKUP=false
BACKUP_FULL=false
BRANCH=""

usage() {
  cat <<'EOF'
Teamflow update — pull latest, build, migrate, restart.

Usage:
  sudo update [--skip-backup] [--backup-full] [--branch <name>]

Options:
  --skip-backup   Skip database backup (not recommended)
  --backup-full   Also back up uploads before update (slow if you have large files)
  --branch NAME   Pull a specific branch instead of the current one
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --backup-full)
      BACKUP_FULL=true
      shift
      ;;
    --branch)
      BRANCH="${2:-}"
      if [[ -z "$BRANCH" ]]; then
        echo "--branch requires a branch name"
        exit 1
      fi
      shift 2
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

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo update"
  exit 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Not a git repo at $APP_DIR."
  echo "Clone https://github.com/mrcool5556/teamflow.git to $APP_DIR first."
  exit 1
fi

echo "==> Teamflow update"
echo "    App dir: $APP_DIR"

systemctl stop teamflow

if [[ "$SKIP_BACKUP" != true ]]; then
  if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    echo "Backup script not found: $BACKUP_SCRIPT"
    echo "Use --skip-backup or run: sudo bash $APP_DIR/deploy/proxmox-lxc/update.sh"
    exit 1
  fi
  if [[ "$BACKUP_FULL" == true ]]; then
    bash "$BACKUP_SCRIPT" --full
  else
    bash "$BACKUP_SCRIPT" --db-only
  fi
fi

cd "$APP_DIR"

if [[ -n "$BRANCH" ]]; then
  sudo -u "$APP_USER" git fetch origin
  sudo -u "$APP_USER" git checkout "$BRANCH"
  sudo -u "$APP_USER" git pull origin "$BRANCH"
else
  sudo -u "$APP_USER" git pull
fi

sudo -u "$APP_USER" pnpm install
sudo -u "$APP_USER" pnpm -r build
sudo -u "$APP_USER" pnpm db:migrate

systemctl start teamflow

echo ""
echo "Update complete."
if curl -sf "http://localhost:3000/health" >/dev/null; then
  echo "Health: ok"
else
  echo "Health check failed — run: journalctl -u teamflow -n 50"
  exit 1
fi
