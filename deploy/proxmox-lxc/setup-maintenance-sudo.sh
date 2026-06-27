#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
BASH_BIN="${BASH_BIN:-/usr/bin/bash}"
BACKUP_REPO="$APP_DIR/deploy/proxmox-lxc/backup.sh"
UPDATE_REPO="$APP_DIR/deploy/proxmox-lxc/update.sh"
BACKUP_BIN="/usr/local/bin/teamflow-backup"
UPDATE_BIN="/usr/local/bin/teamflow-update"
SUDOERS_FILE="/etc/sudoers.d/teamflow-maintenance"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f "$BACKUP_REPO" ]] || [[ ! -f "$UPDATE_REPO" ]]; then
  echo "Scripts not found under $APP_DIR/deploy/proxmox-lxc/"
  exit 1
fi

if [[ ! -x "$BASH_BIN" ]]; then
  echo "bash not found at $BASH_BIN"
  exit 1
fi

fix_script() {
  local script=$1
  sed -i 's/\r$//' "$script"
  chmod +x "$script"
}

fix_script "$BACKUP_REPO"
fix_script "$UPDATE_REPO"

install -m 755 "$BACKUP_REPO" "$BACKUP_BIN"
install -m 755 "$UPDATE_REPO" "$UPDATE_BIN"
ln -sf teamflow-update /usr/local/bin/update

cat >"$SUDOERS_FILE" <<EOF
# Teamflow in-app maintenance (Settings → Updates)
# Installed wrappers: sudo /usr/local/bin/teamflow-backup (no bash prefix)
# Repo scripts: sudo /usr/bin/bash /opt/teamflow/deploy/.../backup.sh
Defaults:$APP_USER env_keep += "APP_DIR BACKUP_DIR"
$APP_USER ALL=(root) NOPASSWD: $BACKUP_BIN *, $UPDATE_BIN *, $BASH_BIN $BACKUP_REPO *, $BASH_BIN $UPDATE_REPO *
EOF

chmod 440 "$SUDOERS_FILE"

if ! visudo -cf "$SUDOERS_FILE"; then
  echo "sudoers validation failed — removed $SUDOERS_FILE"
  rm -f "$SUDOERS_FILE"
  exit 1
fi

echo "Installed passwordless sudo for $APP_USER:"
echo "  $SUDOERS_FILE"
echo ""
echo "Test:"
echo "  sudo -u $APP_USER sudo -n $BACKUP_BIN --db-only"
echo "  sudo -u $APP_USER sudo -n $UPDATE_BIN --help"
echo ""
echo "Restart Teamflow: systemctl restart teamflow"
