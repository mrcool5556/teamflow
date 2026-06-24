# Authentication & password reset

Teamflow uses email + password accounts. Sessions are JWTs stored in the browser. API tokens (PATs) are for MCP, CLI, and the Discord bot.

## Registration & login

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | `{ email, name, password }` — optional `inviteToken` |
| POST | `/auth/login` | `{ email, password }` → `{ user, token }` |
| GET | `/auth/me` | Current user (Bearer token) |
| GET | `/auth/config` | `{ inviteOnly, passwordResetEmail }` |

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
4. If SMTP is **not** configured, the reset URL is logged on the server (`journalctl -u teamflow`).
5. User sets a new password; the token is consumed.

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

## Security notes

- Set a strong `JWT_SECRET` in production (not the example default).
- `.env` should be mode `600` and owned by the `teamflow` user on Linux.
- Password reset responses never reveal whether an email exists in the database.
