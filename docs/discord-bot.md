# Teamflow Discord bot

Talk to your Teamflow board from Discord: slash commands, ticket threads → issues, and share links back to the web UI.

**One bot** (one `.env`) can serve **many Teamflow teams** — each team links its own Discord server in **Settings → Discord bot**.

## Prerequisites

1. **Teamflow server** running and reachable from the machine hosting the bot
2. **Personal access token (PAT)** — Settings → Personal access tokens  
   The PAT user must be a member of every team you link to Discord.
3. **Discord application** with a bot user ([Discord Developer Portal](https://discord.com/developers/applications))

## 1. Create the Discord app

1. Developer Portal → **New Application**
2. **Bot** → **Reset Token** → copy `DISCORD_BOT_TOKEN`
3. Copy **Application ID** → `DISCORD_CLIENT_ID`
4. **Bot → Privileged Gateway Intents** → enable **Message Content Intent** (required for `/create` thread transcripts)
5. In `apps/discord-bot/.env`, set `DISCORD_MESSAGE_CONTENT_INTENT=true`
6. **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **Read Messages/View Channels**, **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Use Slash Commands**
7. Open the generated invite URL and add the bot to each server you use

## 2. Save bot credentials (recommended)

1. Generate a random string for `TEAMFLOW_BOT_CONFIG_KEY` and add it to **both** the Teamflow root `.env` and `apps/discord-bot/.env`
2. Restart the Teamflow API
3. In the web app: **Settings → Integrations → Bot credentials** (admin only)
   - Discord client ID, bot token, Teamflow PAT, API URL, public web URL
   - Enable **Message Content Intent** if you use `/create` in threads
4. Copy `apps/discord-bot/.env.example` to `.env` with at least:

```env
TEAMFLOW_URL=http://localhost:3000
TEAMFLOW_BOT_CONFIG_KEY=same-random-string-as-teamflow-.env
```

5. Run `pnpm dev:discord` — the bot loads token/PAT from Settings via the API

### Legacy `.env` mode

You can still put secrets directly in `apps/discord-bot/.env` (`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `TEAMFLOW_TOKEN`, …) if `TEAMFLOW_BOT_CONFIG_KEY` is unset or the Settings fetch fails.

| Variable | Required | Purpose |
|----------|----------|---------|
| `TEAMFLOW_BOT_CONFIG_KEY` | Settings mode | Shared secret for `GET /integrations/discord/bot-config` |
| `TEAMFLOW_SECRETS_KEY` | Server | Encrypts secrets at rest (defaults to `JWT_SECRET`) |
| `DISCORD_BOT_TOKEN` | Legacy env | Bot token |
| `DISCORD_CLIENT_ID` | Legacy env | Application ID |
| `TEAMFLOW_TOKEN` | Legacy env | Teamflow PAT |
| `TEAMFLOW_URL` | No | API base URL (default `http://localhost:3000`) |
| `TEAMFLOW_PUBLIC_URL` | No | Web URL for `?ref=` links |
| `TEAMFLOW_TEAM_ID` | Yes* | Fallback team UUID |
| `DISCORD_MESSAGE_CONTENT_INTENT` | Yes | Set `true` after enabling intent in Developer Portal |

Optional env fallbacks (Settings UI is preferred): `DISCORD_REGISTER_GUILD_IDS`, `DISCORD_GUILD_TEAMS`, `DISCORD_ALLOWED_ROLE_IDS`, `DISCORD_TICKET_CHANNEL_IDS`.

## 3. Per-team Settings (recommended)

**Settings → Discord bot** for each Teamflow team:

| Field | Purpose |
|-------|---------|
| Discord server ID | Links this team to one Discord guild |
| Allowed role IDs | Who can run slash commands (required — use role IDs, not server ID) |
| Allow Discord administrators | Optional bypass for users with Administrator permission |
| Ticket channel IDs | Optional auto-create on new threads |

The bot registers slash commands for every guild ID saved across teams (on startup). Settings changes apply within ~10 seconds (bot cache).

**Multiple Discord servers:** create a Teamflow team per server and configure each in Settings. Invite the same bot to every server.

## 4. Run the bot

```powershell
cd D:\projects\teamflow
pnpm dev:discord
```

Production:

```powershell
pnpm --filter @teamflow/discord-bot build
pnpm --filter @teamflow/discord-bot start
```

## Slash commands

| Command | Description |
|---------|-------------|
| `/issue ref:11-3` | Show issue summary + share link (paste full `?ref=` URLs too) |
| `/create` | Create issue on the bound team. In a **thread**, title defaults to thread name; thread messages and links are appended to the description. |
| `/link ref:11-3` | Post a `?ref=` share URL |

## Ticket workflow

**Manual (recommended):** Leave ticket channel IDs empty. Discuss in the thread, then run `/create` when ready — full thread transcript goes into the issue.

**Auto-create (optional):** Set ticket channel IDs — new threads create an issue immediately from the thread name and starter message.

## Security notes

- Scope the PAT to a dedicated bot/service user when possible
- Do not use the server ID as a role ID (@everyone would match everyone)
- Bot token and PAT stay encrypted in the database when saved in Settings
- Integration settings in the web UI are **admin-only** (members and viewers cannot open Settings → Integrations)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Slash commands missing | Save server ID in Settings; restart bot; refresh Discord (Ctrl+R) |
| `Team access denied` | PAT user must be on the bound team |
| `Reference not found` | Ref must exist on that team (e.g. `11-3`) |
| `You don't have permission` | Add your Discord **role** ID under Allowed role IDs |
| Commands not configured | Settings must have server ID + at least one allowed role ID |
| `/create` missing thread text | Enable Message Content Intent; set `DISCORD_MESSAGE_CONTENT_INTENT=true` |

## Later (not v1)

- Assign/status updates from Discord
- Webhook announcements on issue changes
- Bot credentials in Settings (encrypted; `integrations.discord.secrets` permission)
