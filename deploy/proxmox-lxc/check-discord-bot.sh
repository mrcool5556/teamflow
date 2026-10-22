#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${TEAMFLOW_APP_DIR:-/opt/teamflow}"

echo "=== Discord bot process ==="
pgrep -af 'node.*discord-bot/dist' || echo "NOT RUNNING"

echo ""
echo "=== Discord systemd unit ==="
systemctl list-unit-files '*discord*' 2>/dev/null || true

# Print whether each key is set, never its value (keys and URLs are secrets or near-secrets).
report_keys() {
  local file=$1
  shift
  for key in "$@"; do
    if grep -Eq "^${key}=.+" "$file" 2>/dev/null; then
      echo "$key: set"
    else
      echo "$key: unset"
    fi
  done
}

echo ""
echo "=== Bot .env ==="
if [[ -f "$APP_DIR/apps/discord-bot/.env" ]]; then
  report_keys "$APP_DIR/apps/discord-bot/.env" TEAMFLOW_URL TEAMFLOW_PUBLIC_URL TEAMFLOW_BOT_CONFIG_KEY
else
  echo "missing: $APP_DIR/apps/discord-bot/.env"
fi

echo ""
echo "=== Server .env (bot-related keys only) ==="
if [[ -f "$APP_DIR/.env" ]]; then
  report_keys "$APP_DIR/.env" PUBLIC_URL TEAMFLOW_BOT_CONFIG_KEY TEAMFLOW_SECRETS_KEY
else
  echo "missing: $APP_DIR/.env"
fi

echo ""
echo "=== Discord secrets in database ==="
DB="$APP_DIR/data/teamflow.db"
if [[ -f "$DB" ]] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 -header -column "$DB" \
    "SELECT (pat_enc IS NOT NULL AND pat_enc != '') AS pat_set, (bot_token_enc IS NOT NULL AND bot_token_enc != '') AS token_set, (client_id IS NOT NULL AND client_id != '') AS client_set FROM discord_bot_secrets;" \
    || echo "sqlite3 query failed"
else
  echo "missing sqlite3 or db at $DB"
fi

echo ""
echo "=== Bot-config endpoint ==="
curl -sS http://127.0.0.1:3000/integrations/discord/bot-config 2>/dev/null | head -c 200 || true
echo ""
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/integrations/discord/bot-config || true
