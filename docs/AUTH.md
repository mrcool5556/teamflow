# Authentication, roles & password reset

Teamflow uses email + password accounts. Every request authenticates with `Authorization: Bearer <token>`, where the token is either a session JWT (web app, CLI email login) or a personal access token (PAT: MCP, CLI, Discord bot). There are no cookies.

## Sessions

- `POST /auth/login` and `POST /auth/register` return `{ user, token }`. The token is an HS256 JWT signed with `JWT_SECRET` (issuer `teamflow`, audience `teamflow-web`), valid for **7 days**.
- The web app keeps it in `localStorage` (`teamflow_token`, plus the user as `teamflow_user`) and sends it as a Bearer header. Logging out only clears the browser copy.
- The JWT carries `ver`, checked against `users.token_version` on every request. A password reset bumps that version, which signs out every session of that user at once. Tokens issued before the column existed count as version 0.

## Registration & login

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | `{ email, name, password }`, optional `inviteToken` |
| POST | `/auth/login` | `{ email, password }` → `{ user, token }` |
| GET | `/auth/me` | Current user (Bearer token); `user.isInstanceAdmin` marks server-wide admins |
| GET | `/auth/config` | `{ inviteOnly, passwordResetEmail }` |

On a fresh server the first account is made on `/setup` with the one-time setup code ([SETUP.md](SETUP.md)); `/auth/register` answers `409 setup_required` until then.

Registering creates only the account. With an `inviteToken` the user also joins the inviting team with the invite's role, in the same transaction, and lands on its board. Without one, the web app shows the welcome page: **Create a Flow** (`POST /teams`) or **Join a Flow** (paste an invite link or code). Whoever creates a Flow is its **Owner**. A Flow a user makes is a **free space** with the free-space upload cap (1 GB by default), at most 3 per person, and the first is never refused; an instance admin's Flows are admin spaces with no cap ([SPACES.md](SPACES.md)).

The welcome page lives at `/welcome` (`/welcome/create`, `/welcome/join`); `/` sends anyone with no Flow there, including someone who left their last one. Join a Flow accepts a full invite link, an old `?invite=` link or the bare code, shows the Flow and role (`GET /invites/:token`) and joins on confirm. An invite link opened while signed out still works as before: the token waits through sign-up, registration joins that Flow, and the person lands on its board.

Accounts made before this change keep the **General** team registration used to create; it counts as one of their free spaces.

Login, register and forgot-password are rate limited per client IP (`TEAMFLOW_AUTH_RATE_LIMIT` per minute, default 10, HTTP 429 with `Retry-After`). Behind a reverse proxy set `TEAMFLOW_TRUST_PROXY=1` so `X-Forwarded-For` is used as the client address.

### Server Owner and trusted admins

Roles inside a Flow are per Flow. Running the server is separate and does not depend on which Flow is open (or whether any is):

- **Server Owner:** one account, the one made on `/setup`. It has every server power. Only the Owner can add or remove trusted admins and change their powers, **transfer ownership** (Server admin → People → Transfer ownership, confirmed by typing the new Owner's email; the old Owner stays a trusted admin with every power), and **delete a Flow for good** (Server admin → Flows → a Flow, confirmed by typing its key). Nobody can remove the Owner.
- **Trusted admins** hold the powers the Owner ticks for them. With none ticked they have no Server admin access.

| Power | What it opens |
|-------|---------------|
| Updates | Install updates, the release channel (`/server/maintenance/update`, `…/settings`) |
| Backups | Back up, restore, the backup list, delete a backup, how many to keep (`/server/maintenance/backup*`, `…/restore`) |
| People | See every account, send password reset links (`/instance/users`, `…/reset-link`) |
| Flows | Make Flows, upload caps, Flow defaults, empty a Flow's trash (`/instance/spaces*`, `/instance/settings`); their own new Flows are admin Flows with no cap |
| Site & email | Site name, public address, email (`/instance/site`, `/instance/mail*`) |
| Discord bot | Bot credentials and service (`/integrations/discord/{secrets,service*}`) |
| Sign-up rules | Who can make an account (`/instance/signup`) |

Any power opens the Overview, the setup checklist and How-tos. Update and job status need Updates or Backups. A route without its power answers `403 forbidden` ("Needs the Backups server power"); Owner-only routes answer "Only the Server Owner can do this".

The web app shows Server admin only to someone with at least one power, and its nav only the sections their powers open. The Owner starts on Server admin → Overview after signing in (with **Go to my Flows**); everyone else starts on their Flow.

Where it comes from:

- On a fresh install the account made on `/setup` is the Owner.
- Upgrading to schema 5 makes the oldest account that held the old instance-admin flag the Owner (never a retired account: an `@invalid.invalid` email or "(retired)" in the name). Every other flagged account becomes a trusted admin with every power.
- `TEAMFLOW_INSTANCE_ADMINS=alice@example.com,bob@example.com` makes those accounts trusted admins with every power at their next login. It never makes an Owner, and the app cannot change or remove them ("Set in .env").

Stored on `users`: `is_server_owner`, `is_instance_admin` (on the admin list) and `server_powers` (JSON). `GET /auth/me` returns `serverRole` (`owner`, `admin` or null), `serverPowers` and `isInstanceAdmin` (any access).

### Team roles

Permissions are per team. Every team starts with four built-in roles; admins can add custom roles in **Settings → Roles**.

| Permission | Owner | Admin | Member | Viewer |
|------------|:-----:|:-----:|:------:|:------:|
| `board.edit` | yes | yes | yes | |
| `team.members.view` | yes | yes | yes | yes |
| `team.members.manage`, `team.invites.manage` | yes | yes | | |
| `team.roles.view`, `team.roles.manage` | yes | yes | | |
| `team.delete` | yes | yes | | |
| `team.data.transfer` (export / import bundle) | yes | | | |
| `integrations.discord.view`, `.manage` | yes | yes | | |

`integrations.discord.secrets`, `server.maintenance.view` and `server.maintenance.run` are retired: they may still be stored on roles (so old roles read the same) but grant nothing and are no longer shown; the instance-admin flag alone covers those actions. The source of truth is `packages/core/src/permissions.ts`; [API.md](API.md) lists the permission each route needs.

### Editing the board (`board.edit`)

Changing the board needs the `board.edit` team permission: creating, editing, moving, completing, deleting and restoring issues; creating, renaming, reordering and deleting rows and columns; posting and deleting comments; uploading, linking, moving and removing attachments; renaming, trashing and restoring team files. Without it these routes return `403 { "error": "Permission denied", "code": "forbidden" }`, and the web board, issue drawer and row files drawer turn read-only (issues still open). Reading is unchanged.

- Owner, Admin and Member have it by default; the built-in **Viewer** does not.
- On upgrade (schema version 3) every existing role except the built-in Viewer, custom roles included, gets it once, so nobody loses access. Admins can then remove it from custom roles in Settings → Roles ("Board" group); later upgrades do not re-grant it.
- PATs act as their user, so a token owned by a Viewer cannot change the board (MCP, CLI, Discord bot).

### Role and member safety rules

- A role can only grant permissions the acting user already holds.
- An invite cannot carry a role ranked above the inviter's.
- Only an Owner can promote someone to Owner, demote an Owner, or remove an Owner.

### Invite-only registration

Set on the server:

```env
TEAMFLOW_INVITE_ONLY=true
```

Users must open a team invite link (`/invite/<token>`) before they can register.

Or switch **Who can sign up** on Server admin → Flow defaults & sign-up (no restart). The `.env` value wins when set.

## Forgot password

| Method | Path | Body |
|--------|------|------|
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, password }` |

Flow:

1. User clicks **Forgot password?** on the login screen.
2. Server creates a one-hour reset token.
3. If **SMTP is configured**, an email is sent with a link like
   `https://your-domain/?reset=<token>` (built from `PUBLIC_URL`; the web app redirects it to `/reset`).
4. If SMTP is **not** configured, the link is only printed to the server log when `NODE_ENV=development`; in production nothing usable is logged, so configure SMTP.
5. User sets a new password; the token is consumed and **every existing session for that user is signed out**.

The response to forgot-password is identical whether or not the email exists.

### SMTP (production)

The easiest way is Server admin → Site & email: fill in the server, send a test, save. The password is stored encrypted with `TEAMFLOW_SECRETS_KEY` (or `JWT_SECRET`); changing that key means entering it again.

Or add to the server environment (which wins over the admin page) (`/opt/teamflow/.env` on LXC):

```env
PUBLIC_URL=https://teamflow.example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_FROM=you@example.com
```

On Proxmox LXC:

```bash
sudo teamflow-smtp
```

See [SELF-HOSTING.md](SELF-HOSTING.md#smtp-password-reset-emails) for provider examples. The server reads these from `.env` or its environment (systemd `EnvironmentFile`, NSSM or your shell); the environment wins.

**Gmail:** use an [App password](https://support.google.com/accounts/answer/185833), not your normal Gmail password. Host is `smtp.gmail.com`, not your email address.

## API tokens (PATs)

Create in the web UI: **Settings → API tokens**.

Used by:

- MCP (`TEAMFLOW_TOKEN`)
- CLI (`teamflow login --token`)
- Discord bot (PAT saved in Settings → Integrations, or `TEAMFLOW_TOKEN` in the bot's `.env`)

Scopes: `read`, `write`. Optional `teamId` restricts the token to one team.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/tokens` | Requires write scope. A PAT may only mint tokens for its own team and with scopes it already has. |
| GET | `/auth/tokens` | List the caller's tokens (prefix only, never the secret). |
| DELETE | `/auth/tokens/:id` | Revoke a token. |

A PAT created with a `teamId` is enforced on **every** route that resolves a team (teams, rows, statuses, issues, files, uploads, members, projects), not only `/issues`.

- Format `pat_` + 48 hex characters; only a SHA-256 hash and the 12-character prefix are stored, so the secret is shown once.
- Read-only PATs get `403 forbidden` on every mutating route.
- A PAT acts as its user: one owned by a Viewer cannot change the board, one owned by a non-admin cannot reach server-wide routes.
- PATs **do not expire**. Revoke unused ones in Settings → API tokens. `last_used_at` is updated at most every 5 minutes.

## Security notes

- `JWT_SECRET` is required. The server refuses to start if it is unset, shorter than 16 characters or one of the shipped placeholders, unless `NODE_ENV=development` or `TEAMFLOW_ALLOW_DEV_SECRET=1`. The same rule applies to `TEAMFLOW_SECRETS_KEY` when set (unset falls back to `JWT_SECRET`); integration secrets at rest use a scrypt-derived key (older `v1` values still decrypt).
- CORS is an allowlist: `PUBLIC_URL` plus `CORS_ORIGINS` (comma-separated); outside production `localhost:5173-5179` is allowed for the Vite dev server. Every response carries `X-Content-Type-Options: nosniff`.
- Attachments render inline only when the file's own bytes are an image, video or PDF; everything else downloads as `application/octet-stream`.
- Request bodies are capped: 1 MB for JSON, the configured attachment / bundle maximum for uploads.
- No demo account is seeded unless `TEAMFLOW_SEED_DEMO=1`.
- `.env` should be mode `600` and owned by the `teamflow` user on Linux.
- Password reset responses never reveal whether an email exists in the database.
- Session JWTs live in `localStorage`, so an XSS bug would expose them, and there is no per-session revocation (a password reset revokes all).
