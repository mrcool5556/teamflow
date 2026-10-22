# Authentication & password reset

Teamflow uses email + password accounts. Sessions are JWTs stored in the browser. API tokens (PATs) are for MCP, CLI, and the Discord bot.

## Registration & login

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | `{ email, name, password }` — optional `inviteToken` |
| POST | `/auth/login` | `{ email, password }` → `{ user, token }` |
| GET | `/auth/me` | Current user (Bearer token); `user.isInstanceAdmin` marks server-wide admins |
| GET | `/auth/config` | `{ inviteOnly, passwordResetEmail }` |

Login, register and forgot-password are rate limited per client IP (`TEAMFLOW_AUTH_RATE_LIMIT` per minute, default 10, HTTP 429 with `Retry-After`). Behind a reverse proxy set `TEAMFLOW_TRUST_PROXY=1` so `X-Forwarded-For` is used as the client address.

### Instance admin

Team roles are per team. Server-wide actions (Settings → Updates, Discord bot secrets, Discord bot service start/stop) additionally require the **instance admin** flag on the account (`users.is_instance_admin`):

- On a fresh install the **first registered account** gets it.
- On upgrade, the oldest existing account is promoted once when the column is added.
- `TEAMFLOW_INSTANCE_ADMINS=alice@example.com,bob@example.com` grants it to those emails at their next login.

Without the flag those routes return `403 { "error": "Instance admin required" }` even for team Owners, and the web app hides the panels.

### Editing the board (`board.edit`)

Changing the board needs the `board.edit` team permission: creating, editing, moving, completing, deleting and restoring issues; creating, renaming, reordering and deleting rows and columns; posting and deleting comments; uploading, linking, moving and removing attachments; renaming, trashing and restoring team files. Without it these routes return `403 { "error": "Permission denied", "code": "forbidden" }`, and the web board turns read-only (issues still open). Reading is unchanged.

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

Users must open a team invite link before they can register.

## Forgot password

| Method | Path | Body |
|--------|------|------|
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, password }` |

Flow:

1. User clicks **Forgot password?** on the login screen.
2. Server creates a one-hour reset token.
3. If **SMTP is configured**, an email is sent with a link like  
   `https://your-domain/?reset=<token>`.
4. If SMTP is **not** configured, the link is only printed to the server log when `NODE_ENV=development`; in production nothing usable is logged, so configure SMTP.
5. User sets a new password; the token is consumed and **every existing session for that user is signed out** (the JWT carries `users.token_version`, which the reset bumps).

The response to forgot-password is identical whether or not the email exists.

### SMTP (production)

Add to `.env` on your server:

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

See [SELF-HOSTING.md](SELF-HOSTING.md#smtp-password-reset-emails) for provider examples.

**Gmail:** use an [App password](https://support.google.com/accounts/answer/185833), not your normal Gmail password. Host is `smtp.gmail.com`, not your email address.

## API tokens (PATs)

Create in the web UI: **Settings → API tokens**.

Used by:

- Cursor MCP (`TEAMFLOW_TOKEN`)
- CLI (`teamflow login` or `--token`)
- Discord bot (optional PAT in Settings or `.env`)

Scopes: `read`, `write`.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/tokens` | Requires write scope. A PAT may only mint tokens for its own team and with scopes it already has. |
| GET | `/auth/tokens` | List the caller's tokens (prefix only, never the secret). |
| DELETE | `/auth/tokens/:id` | Revoke a token. |

A PAT created with a `teamId` is enforced on **every** route that resolves a team (teams, rows, statuses, issues, files, uploads, members, projects), not only `/issues`.

## Security notes

- `JWT_SECRET` is required. The server refuses to start if it is unset, shorter than 16 characters or one of the shipped placeholders, unless `NODE_ENV=development` or `TEAMFLOW_ALLOW_DEV_SECRET=1`. The same rule applies to `TEAMFLOW_SECRETS_KEY`; integration secrets at rest use a scrypt-derived key (older `v1` values still decrypt).
- CORS is an allowlist: `PUBLIC_URL` plus `CORS_ORIGINS` (comma-separated); outside production `localhost:5173-5179` is allowed for the Vite dev server. Every response carries `X-Content-Type-Options: nosniff`.
- Attachments render inline only when the file's own bytes are an image, video or PDF; everything else downloads as `application/octet-stream`.
- Request bodies are capped: 1 MB for JSON, the configured attachment / bundle maximum for multipart uploads.
- No demo account is seeded unless `TEAMFLOW_SEED_DEMO=1`.
- `.env` should be mode `600` and owned by the `teamflow` user on Linux.
- Password reset responses never reveal whether an email exists in the database.
