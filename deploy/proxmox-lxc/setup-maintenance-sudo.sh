#!/usr/bin/env bash
set -euo pipefail

# Installs the maintenance scripts into a root-owned directory and grants the app user
# passwordless sudo for those copies only. The repo checkout under $APP_DIR is owned by the
# app user, so it must never appear in sudoers: anyone who can write there would be root.

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"
LIB_DIR="/usr/local/lib/teamflow"
BACKUP_REPO="$APP_DIR/deploy/proxmox-lxc/backup.sh"
UPDATE_REPO="$APP_DIR/deploy/proxmox-lxc/update.sh"
DISCORD_REPO="$APP_DIR/deploy/proxmox-lxc/discord-bot.sh"
BACKUP_BIN="$LIB_DIR/backup.sh"
UPDATE_BIN="$LIB_DIR/update.sh"
DISCORD_BIN="$LIB_DIR/discord-bot.sh"
SUDOERS_FILE="/etc/sudoers.d/teamflow-maintenance"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f "$BACKUP_REPO" ]] || [[ ! -f "$UPDATE_REPO" ]] || [[ ! -f "$DISCORD_REPO" ]]; then
  echo "Scripts not found under $APP_DIR/deploy/proxmox-lxc/"
  exit 1
fi

fix_script() {
  local script=$1
  sed -i 's/\r$//' "$script"
  chmod +x "$script"
}

fix_script "$BACKUP_REPO"
fix_script "$UPDATE_REPO"
fix_script "$DISCORD_REPO"

# Root-owned copies: directory 755, files 755, owner root. The app user can execute but not edit.
install -d -m 755 -o root -g root "$LIB_DIR"

# Every file is written to a temp path in its own directory and then renamed over the old one.
# A rename is atomic, so a `sudo -n` probe from the app (Settings → Updates checks while update.sh
# re-runs this script) always finds a complete file, never a missing or half-written one.
TMP_FILES=()
cleanup_tmp() {
  if [[ ${#TMP_FILES[@]} -gt 0 ]]; then rm -f "${TMP_FILES[@]}"; fi
}
trap cleanup_tmp EXIT

install_atomic() {
  local src=$1 dest=$2
  local tmp="$dest.tmp.$$"
  TMP_FILES+=("$tmp")
  install -m 755 -o root -g root "$src" "$tmp"
  mv -f "$tmp" "$dest"
}

install_atomic "$BACKUP_REPO" "$BACKUP_BIN"
install_atomic "$UPDATE_REPO" "$UPDATE_BIN"
install_atomic "$DISCORD_REPO" "$DISCORD_BIN"

# Convenience names for humans on the box; sudoers does not reference these.
ln -sf "$UPDATE_BIN" /usr/local/bin/teamflow-update
ln -sf "$BACKUP_BIN" /usr/local/bin/teamflow-backup
ln -sf "$DISCORD_BIN" /usr/local/bin/teamflow-discord
ln -sf "$UPDATE_BIN" /usr/local/bin/update

# No Defaults line preserving the caller environment: the scripts use arguments and their own defaults.
# Written to a temp name first: it contains a dot, so sudo's #includedir ignores it until it is
# renamed into place, and a file that fails validation is dropped while the working one stays.
SUDOERS_TMP="$SUDOERS_FILE.tmp.$$"
TMP_FILES+=("$SUDOERS_TMP")
cat >"$SUDOERS_TMP" <<EOF
# Teamflow in-app maintenance (Settings → Updates) and Discord bot service (Settings → Integrations)
# Only the root-owned copies under $LIB_DIR are allowed. Re-run setup-maintenance-sudo.sh after
# changing the scripts in the repo; update.sh does this automatically.
$APP_USER ALL=(root) NOPASSWD: $BACKUP_BIN *, $UPDATE_BIN *, $DISCORD_BIN *
EOF

chown root:root "$SUDOERS_TMP"
chmod 440 "$SUDOERS_TMP"

if ! visudo -cf "$SUDOERS_TMP"; then
  echo "sudoers validation failed — kept the existing $SUDOERS_FILE"
  exit 1
fi
mv -f "$SUDOERS_TMP" "$SUDOERS_FILE"

echo "Installed root-owned maintenance scripts in $LIB_DIR and passwordless sudo for $APP_USER:"
echo "  $SUDOERS_FILE"
echo ""
echo "Test:"
echo "  sudo -u $APP_USER sudo -n $BACKUP_BIN --db-only"
echo "  sudo -u $APP_USER sudo -n $UPDATE_BIN --help"
echo "  sudo -u $APP_USER sudo -n $DISCORD_BIN status"
echo ""
echo "Restart Teamflow: systemctl restart teamflow"
