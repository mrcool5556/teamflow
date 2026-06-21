# Teamflow Discord bot

Talk to your Teamflow board from Discord: slash commands, ticket threads → issues, and share links back to the web UI.

## Prerequisites

1. **Teamflow server** running and reachable from the machine hosting the bot
2. **Personal access token (PAT)** — Settings → Personal access tokens in the web UI  
   The PAT’s user must be a member of the team you bind to Discord.
3. **Discord application** with a bot user ([Discord Developer Portal](https://discord.com/developers/applications))

## 1. Create the Discord app

1. Developer Portal → **New Application**
2. **Bot** → **Reset Token** → copy `DISCORD_BOT_TOKEN`
3. Copy **Application ID** → `DISCORD_CLIENT_ID`
4. **Bot → Privileged Gateway Intents** → enable **Message Content Intent** (required for `/create` thread transcripts and ticket starter text)
5. In `apps/discord-bot/.env`, set `DISCORD_MESSAGE_CONTENT_INTENT=true`
6. **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **Read Messages/View Channels**, **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Use Slash Commands**
7. Open the generated invite URL and add the bot to your server

## 2. Configure environment

Create `apps/discord-bot/.env` (or export variables in your shell / service):

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id

TEAMFLOW_URL=http://localhost:3000
TEAMFLOW_PUBLIC_URL=http://localhost:5173
TEAMFLOW_TOKEN=pat_your_token_here

# Default team for all guilds (UUID from Teamflow)
TEAMFLOW_TEAM_ID=your-team-uuid

# Optional: per-Discord-server team mapping
# DISCORD_GUILD_TEAMS={"123456789012345678":"team-uuid-for-this-guild"}

# Optional: register slash commands to specific guilds (faster updates while developing)
# DISCORD_REGISTER_GUILD_IDS=123456789012345678

# Optional: ticket channels — new threads here auto-create issues
# DISCORD_TICKET_CHANNEL_IDS=987654321098765432
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application ID (slash command registration) |
| `TEAMFLOW_TOKEN` | Yes | Teamflow PAT |
| `TEAMFLOW_URL` | No | API base URL (default `http://localhost:3000`) |
| `TEAMFLOW_PUBLIC_URL` | No | Web URL for `?ref=` links (default `http://localhost:5173`) |
| `TEAMFLOW_TEAM_ID` | Yes* | Default team UUID |
| `DISCORD_GUILD_TEAMS` | Yes* | JSON map of Discord guild ID → team UUID |
| `DISCORD_REGISTER_GUILD_IDS` | No | Comma-separated guild IDs for guild-scoped slash commands |
| `DISCORD_MESSAGE_CONTENT_INTENT` | No | Set `true` after enabling Message Content Intent in Developer Portal |
| `DISCORD_ALLOWED_ROLE_IDS` | No | Env fallback for allowed roles if guild not linked in Settings UI |
| `DISCORD_TICKET_CHANNEL_IDS` | No | Env fallback for ticket channels (or use Settings UI) |

\* Set `TEAMFLOW_TEAM_ID` and/or `DISCORD_GUILD_TEAMS`, or link the guild in Settings UI.

### Find your team ID

- Web UI workspace dropdown + browser devtools on API calls, or  
- `GET /teams` with your PAT, or  
- MCP / CLI `list_teams`

## Settings UI (recommended)

Team admins can configure Discord integration without editing env files:

**Settings → Discord bot** (per team)

| Field | Purpose |
|-------|---------|
| Discord server ID | Links this Teamflow team to your Discord guild |
| Allowed role IDs | Who can run `/create`, `/issue`, `/link` (Discord admins always can; empty list = admins only) |
| Ticket channel IDs | Threads in these channels auto-create issues |

Bot token and PAT still live in `apps/discord-bot/.env`. Role and channel changes apply within ~30 seconds (bot cache).

## 3. Run the bot

```powershell
cd D:\projects\teamflow
pnpm install
pnpm --filter @teamflow/discord-bot dev
```

Production:

```powershell
pnpm --filter @teamflow/discord-bot build
pnpm --filter @teamflow/discord-bot start
```

Slash commands may take up to an hour to appear globally; use `DISCORD_REGISTER_GUILD_IDS` for instant updates on a test server.

## Slash commands

| Command | Description |
|---------|-------------|
| `/issue ref:11-3` | Show issue summary + share link (paste full `?ref=` URLs too) |
| `/create title:… description:…` | Create issue on the bound team (first board row). In a **thread**, recent messages and links are appended to the description automatically. |
| `/link ref:11-3` | Post a `?ref=` share URL |

## Ticket threads

When ticket channel IDs are configured (Settings UI or `DISCORD_TICKET_CHANNEL_IDS`):

1. Someone creates a **thread** in one of those channels
2. The bot creates a Teamflow issue (thread name = title, starter message = description)
3. The bot replies in the thread with the issue ref and share link

## Security notes

- The PAT acts as a single Teamflow user — scope it to a bot/service account if possible
- One team per Discord server is typical; use `DISCORD_GUILD_TEAMS` for multi-team servers
- Do not commit tokens; use env vars or your host’s secret store

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Slash commands missing | Re-run bot; check `DISCORD_CLIENT_ID`; try `DISCORD_REGISTER_GUILD_IDS` |
| `Team access denied` | PAT user must be on the bound team |
| `Reference not found` | Ref must exist on that team (e.g. `GEN-3`, not another team’s key) |
| Ticket issues not created | Add channel IDs in Settings → Discord bot (or env); bot needs thread permissions |
| `You don't have permission` | Add your Discord role ID under Allowed role IDs in Settings → Discord bot |
| `/create` only shows bot text in thread | Enable **Message Content Intent** in Developer Portal, set `DISCORD_MESSAGE_CONTENT_INTENT=true`, restart bot |
