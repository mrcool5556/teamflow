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

# Local sed/chmod on deploy scripts (e.g. CRLF fixes) must not block updates.
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout -- deploy/proxmox-lxc/*.sh 2>/dev/null || true
fi

if [[ -n "$BRANCH" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull origin "$BRANCH"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" pull
fi

sudo -u "$APP_USER" pnpm install
sudo -u "$APP_USER" pnpm -r build
sudo -u "$APP_USER" pnpm db:migrate

systemctl start teamflow

install -m 755 "$APP_DIR/deploy/proxmox-lxc/update.sh" /usr/local/bin/teamflow-update
install -m 755 "$APP_DIR/deploy/proxmox-lxc/backup.sh" /usr/local/bin/teamflow-backup
ln -sf teamflow-update /usr/local/bin/update
bash "$APP_DIR/deploy/proxmox-lxc/setup-maintenance-sudo.sh" || true

wait_for_health() {
  local url="http://127.0.0.1:3000/health"
  local attempt
  for attempt in $(seq 1 30); do
    if curl -sf "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

echo ""
echo "Update complete."
if wait_for_health; then
  echo "Health: ok"
else
  echo "Health check failed after 30s — the service may still be starting."
  echo "Run: systemctl status teamflow"
  echo "Run: journalctl -u teamflow -n 50"
  echo "Run: curl http://127.0.0.1:3000/health"
  exit 1
fi
