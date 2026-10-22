# Teamflow Discord bot

Talk to your Teamflow board from Discord: slash commands, ticket threads → issues, and share links back to the web UI.

**One bot** can serve **many Teamflow teams**: each team links its own Discord server in **Settings → Integrations**.

## How it connects

The bot (`apps/discord-bot`) is a separate Node process. It needs a Discord bot token and a Teamflow PAT. Two ways to give it those:

1. **Settings mode (recommended).** An instance admin saves the Discord token, client ID and PAT in the web app; they are stored encrypted (`TEAMFLOW_SECRETS_KEY`, or `JWT_SECRET` when unset). The bot starts with only `TEAMFLOW_URL` and `TEAMFLOW_BOT_CONFIG_KEY`, calls `GET /integrations/discord/bot-config` with header `X-Teamflow-Bot-Key`, and receives the secrets. The server answers `503` while `TEAMFLOW_BOT_CONFIG_KEY` is unset on the server.
2. **`.env` mode.** Put `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` and `TEAMFLOW_TOKEN` in `apps/discord-bot/.env`. Settings mode also falls back to this file when the bot-config call fails.

The bot always loads `apps/discord-bot/.env` if it exists, also under systemd. It never overrides variables that are already set, so the systemd `EnvironmentFile` (`data/discord-bot.env`) wins where both define a value.

## Prerequisites

1. **Teamflow server** running and reachable from the machine that hosts the bot.
2. **A PAT** (Settings → API tokens) owned by a user who is a member of every team you link, with `write` scope and `board.edit` on those teams (needed for `/create`). A dedicated bot user is best.
3. **A Discord application** with a bot user ([Discord Developer Portal](https://discord.com/developers/applications)).

## 1. Create the Discord app

1. Developer Portal → **New Application**
2. **Bot** → **Reset Token** → copy the bot token
3. Copy the **Application ID** (client ID)
4. **Bot → Privileged Gateway Intents** → enable **Message Content Intent** (needed for `/create` thread transcripts)
5. **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **View Channels**, **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Use Slash Commands**
6. Open the generated invite URL and add the bot to each server

## 2. Save bot credentials (Settings mode)

Open **Settings → Integrations** for a team (`/t/<TEAM>/settings/integrations`).

| Section | Who sees it | What it does |
|---------|-------------|--------------|
| **Bot credentials** | Instance admin with `integrations.discord.secrets` | Discord client ID, bot token, Teamflow PAT, API URL, public web URL, Message Content Intent. Instance-wide, shared by every team |
| **Discord bot on this server** | View: `integrations.discord.view`. Enable / restart / stop: instance admin with `integrations.discord.secrets` | Runs `teamflow-discord` (systemd) on Linux |
| **Discord bot** (per team) | View: `integrations.discord.view`. Edit: `integrations.discord.manage` | Guild ID, allowed role IDs, ticket channels |

Owner and Admin have the three `integrations.discord.*` permissions by default; the instance-admin flag is separate (see [AUTH.md](AUTH.md#instance-admin)).

Saving credentials on the server also:

- generates `TEAMFLOW_BOT_CONFIG_KEY` and appends it to the root `.env` if it is missing;
- writes `data/discord-bot.env` with `TEAMFLOW_URL` and that key (the systemd unit's `EnvironmentFile`).

**Linux (Setup B):** the service buttons run `/usr/local/lib/teamflow/discord-bot.sh` through `sudo -n`, so `deploy/proxmox-lxc/setup-maintenance-sudo.sh` must have run once (the installer and `sudo update` run it). `TEAMFLOW_MAINTENANCE_ENABLED` is not needed for the bot. Without it the panel says so and the buttons stay disabled; on the box you can still run `sudo teamflow-discord status` (or `enable`, `restart`, `stop`) by hand.

**Windows / development:** run the bot yourself. Copy `apps/discord-bot/.env.example` to `apps/discord-bot/.env`:

```env
TEAMFLOW_URL=http://localhost:3000
TEAMFLOW_BOT_CONFIG_KEY=<same value as the server's TEAMFLOW_BOT_CONFIG_KEY>
```

```powershell
pnpm dev:discord
```

The server only reads `TEAMFLOW_BOT_CONFIG_KEY` from its own environment at boot. When the UI generated a key into `.env`, the running server already uses it; after a restart make sure your environment provides it (systemd does through `EnvironmentFile`).

## 3. Per-team settings

**Settings → Integrations → Discord bot** for each Teamflow team:

| Field | Purpose |
|-------|---------|
| Discord server ID | Links this team to one Discord guild |
| Allowed role IDs | Who can run slash commands (required; role IDs, not the server ID) |
| Allow Discord administrators | Optional bypass for users with Administrator permission |
| Ticket channel IDs | Optional auto-create on new threads |

The bot registers slash commands for every guild ID saved across teams at startup. Settings changes apply within about 10 seconds (bot cache).

**Multiple Discord servers:** one Teamflow team per server, each configured in its own Settings. Invite the same bot to every server.

## Environment reference (bot process)

| Variable | Mode | Purpose |
|----------|------|---------|
| `TEAMFLOW_URL` | both | API base URL (default `http://localhost:3000`) |
| `TEAMFLOW_BOT_CONFIG_KEY` | Settings | Shared key for `GET /integrations/discord/bot-config` |
| `DISCORD_BOT_TOKEN` | `.env` | Bot token |
| `DISCORD_CLIENT_ID` | `.env` | Application ID |
| `TEAMFLOW_TOKEN` | `.env` | Teamflow PAT |
| `TEAMFLOW_PUBLIC_URL` | `.env` | Web URL for share links (default `http://localhost:5173`) |
| `DISCORD_MESSAGE_CONTENT_INTENT` | `.env` | `true` after enabling the intent in the Developer Portal |
| `TEAMFLOW_TEAM_ID` | optional | Fallback team when a guild is not linked |

Optional `.env` fallbacks (Settings is preferred): `DISCORD_REGISTER_GUILD_IDS`, `DISCORD_GUILD_TEAMS` (JSON guild → team), `DISCORD_ALLOWED_ROLE_IDS`, `DISCORD_ALLOW_ADMINISTRATORS`, `DISCORD_TICKET_CHANNEL_IDS`.

## 4. Run the bot by hand

```powershell
pnpm dev:discord                                   # development (tsx)
pnpm --filter @teamflow/discord-bot build
pnpm --filter @teamflow/discord-bot start          # production
```

## Slash commands

| Command | Description |
|---------|-------------|
| `/issue ref:11-3` | Issue summary + share link (full `?ref=` URLs also work) |
| `/create` | Create an issue on the bound team. In a **thread**, the title defaults to the thread name and the thread's messages and links are appended to the description |
| `/link ref:11-3` | Post a share URL |

## Ticket workflow

**Manual (recommended):** leave ticket channel IDs empty. Discuss in the thread, then run `/create` when ready; the transcript goes into the issue.

**Auto-create (optional):** set ticket channel IDs; new threads create an issue at once from the thread name and starter message. This path does not check Discord roles.

## Security notes

- One PAT is shared by every team the bot serves; scope it to a dedicated user.
- Do not use the server ID as a role ID (`@everyone` would match everyone).
- Bot token and PAT are encrypted at rest when saved in Settings; `.env` mode keeps them in plain text.
- Settings mode sends secrets over whatever `TEAMFLOW_URL` uses; keep it on localhost or HTTPS.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Slash commands missing | Save the server ID in Settings; restart the bot; refresh Discord (Ctrl+R) |
| `Team access denied` | The PAT's user must be on the bound team |
| `Permission denied` on `/create` | The PAT's user needs `board.edit` on that team |
| `Reference not found` | The ref must exist on that team (e.g. `11-3`) |
| `You don't have permission` | Add your Discord **role** ID under Allowed role IDs |
| Commands not configured | Settings needs a server ID and at least one allowed role ID |
| `/create` missing thread text | Enable Message Content Intent in the Portal and in Bot credentials |
| Enable button fails with a sudo error | Run `sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh` once |
| Bot cannot load secrets (`503`) | Server has no `TEAMFLOW_BOT_CONFIG_KEY`; save credentials again or set it and restart |
