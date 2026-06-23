#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/teamflow}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

usage() {
  cat <<'EOF'
Configure SMTP for Teamflow password reset emails.

Usage:
  sudo bash deploy/proxmox-lxc/configure-smtp.sh
  sudo SMTP_HOST=smtp.example.com SMTP_USER=user SMTP_PASS=secret \
    SMTP_FROM=teamflow@example.com bash deploy/proxmox-lxc/configure-smtp.sh

Environment (optional — prompts when missing):
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run install.sh first."
  exit 1
fi

prompt() {
  local label=$1
  local default=${2:-}
  local value
  if [[ -n "$default" ]]; then
    read -rp "$label [$default]: " value
    echo "${value:-$default}"
  else
    read -rp "$label: " value
    echo "$value"
  fi
}

prompt_secret() {
  local label=$1
  local value
  read -rsp "$label: " value
  echo ""
  echo "$value"
}

echo "==> Teamflow SMTP configuration"
echo "    Env file: $ENV_FILE"
echo ""
echo "Use your email provider's SMTP settings (Gmail app password, Mailgun, SendGrid, etc.)."
echo "Leave SMTP_HOST empty to skip."
echo ""

if [[ -z "${SMTP_HOST:-}" ]]; then
  SMTP_HOST="$(prompt "SMTP host (empty to skip)" "")"
fi

if [[ -z "$SMTP_HOST" ]]; then
  echo "Skipped — password reset links will be logged on the server until SMTP is configured."
  echo "Re-run this script anytime: sudo bash deploy/proxmox-lxc/configure-smtp.sh"
  exit 0
fi

SMTP_PORT="${SMTP_PORT:-$(prompt "SMTP port" "587")}"
SMTP_SECURE="${SMTP_SECURE:-$(prompt "SMTP secure (true for 465, false for 587)" "false")}"
SMTP_USER="${SMTP_USER:-$(prompt "SMTP username" "")}"
SMTP_PASS="${SMTP_PASS:-$(prompt_secret "SMTP password")}"
SMTP_FROM="${SMTP_FROM:-$(prompt "From address" "teamflow@localhost")}"

strip_smtp_from_env() {
  local tmp
  tmp="$(mktemp)"
  grep -v '^SMTP_' "$ENV_FILE" | grep -v '^# SMTP (' > "$tmp" || true
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

strip_smtp_from_env

cat >> "$ENV_FILE" <<EOF

# SMTP (password reset emails)
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_SECURE=$SMTP_SECURE
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
EOF

chmod 600 "$ENV_FILE"
chown teamflow:teamflow "$ENV_FILE" 2>/dev/null || true

if systemctl is-active --quiet teamflow 2>/dev/null; then
  systemctl restart teamflow
  echo ""
  echo "SMTP saved. teamflow service restarted."
else
  echo ""
  echo "SMTP saved. Start teamflow when ready: systemctl start teamflow"
fi

echo "Password reset emails are enabled when SMTP_HOST is set."
