#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${TEAMFLOW_APP_DIR:-/opt/teamflow}"

echo "=== Discord bot process ==="
pgrep -af 'node.*discord-bot/dist' || echo "NOT RUNNING"

echo ""
echo "=== Discord systemd unit ==="
systemctl list-unit-files '*discord*' 2>/dev/null || true

echo ""
echo "=== Bot .env ==="
if [[ -f "$APP_DIR/apps/discord-bot/.env" ]]; then
  grep -E '^(TEAMFLOW_URL|TEAMFLOW_PUBLIC_URL|TEAMFLOW_BOT_CONFIG_KEY)=' "$APP_DIR/apps/discord-bot/.env" || true
else
  echo "missing: $APP_DIR/apps/discord-bot/.env"
fi

echo ""
echo "=== Server .env (bot-related keys only) ==="
grep -E '^(PUBLIC_URL|TEAMFLOW_BOT_CONFIG_KEY|TEAMFLOW_SECRETS_KEY)=' "$APP_DIR/.env" 2>/dev/null || echo "(no bot keys in root .env)"

echo ""
echo "=== Discord secrets in database ==="
DB="$APP_DIR/data/teamflow.db"
if [[ -f "$DB" ]] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 -header -column "$DB" \
    "SELECT teamflow_url, public_url, length(pat_enc) AS pat_len, length(bot_token_enc) AS token_len, length(client_id) AS client_len FROM discord_bot_secrets;" \
    || echo "sqlite3 query failed"
else
  echo "missing sqlite3 or db at $DB"
fi

echo ""
echo "=== Bot-config endpoint ==="
curl -sS http://127.0.0.1:3000/integrations/discord/bot-config 2>/dev/null | head -c 200 || true
echo ""
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/integrations/discord/bot-config || true
