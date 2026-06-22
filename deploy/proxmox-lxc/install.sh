#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
APP_USER="${APP_USER:-teamflow}"

echo "==> Teamflow LXC install"
echo "    App dir: $APP_DIR"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

apt update
apt install -y curl git ca-certificates postgresql postgresql-contrib build-essential python3

if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

corepack enable
corepack prepare pnpm@9.15.0 --activate

id "$APP_USER" &>/dev/null || useradd -r -m -d "$APP_DIR" -s /bin/bash "$APP_USER"

if [[ ! -d "$APP_DIR/.git" ]] && [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Clone or copy Teamflow to $APP_DIR first."
  exit 1
fi

cd "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1 || \
  sudo -u postgres createuser "$APP_USER"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='teamflow'" | grep -q 1 || \
  sudo -u postgres createdb -O "$APP_USER" teamflow

if [[ ! -f .env ]]; then
  cp deploy/proxmox-lxc/.env.example .env
  sed -i "s/teamflow:teamflow@/teamflow:${APP_USER}@/" .env || true
  echo "Edit $APP_DIR/.env and set JWT_SECRET before production use."
fi

sudo -u "$APP_USER" pnpm install
sudo -u "$APP_USER" pnpm build

# Note: Postgres driver migration is Phase 2 — for now SQLite fallback on LXC if DATABASE_URL uses file:
if grep -q '^DATABASE_URL=file:' .env 2>/dev/null; then
  sudo -u "$APP_USER" pnpm db:setup
else
  echo "PostgreSQL configured — run Drizzle Postgres migrations when added (Phase 2)."
  echo "For now, set DATABASE_URL=file:./data/teamflow.db in .env for SQLite on LXC."
fi

cp deploy/proxmox-lxc/teamflow.service /etc/systemd/system/teamflow.service
systemctl daemon-reload
systemctl enable teamflow
systemctl restart teamflow

install -m 755 deploy/proxmox-lxc/update.sh /usr/local/bin/teamflow-update
ln -sf teamflow-update /usr/local/bin/update

echo ""
echo "Install complete."
echo "  systemctl status teamflow"
echo "  curl http://localhost:3000/health"
echo "  update                 # pull, build, migrate, restart (after git clone)"
