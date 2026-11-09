# First-time setup

A brand-new server (no accounts at all) is set up in the browser at `/setup`. The person installing it creates the admin account there, using a **one-time setup code**, so a stranger who finds the server first cannot claim it.

Once any account exists, `/setup` is closed for good: the server refuses a second setup (`409 setup_done`) and the web app sends `/setup` to the login page. Existing servers never see it.

## Contract with the installers

This is what every installer (Proxmox LXC, Docker, Windows, manual) can rely on.

### Where the code lives

| Source | When |
|--------|------|
| `TEAMFLOW_SETUP_CODE` in the server's environment | Optional. If an installer sets it, the server uses exactly that value. |
| `<data dir>/setup-code` | Otherwise the server creates it at first start and reuses it on every restart until setup is done. `<data dir>` is the folder that holds the database: `dirname(DATABASE_URL)`, by default `<repo>/data/` (on LXC `/opt/teamflow/data/setup-code`). Mode `600`, owned by the service user. One line: the code. |
| Server log | At start, while setup is needed, the server prints the code and the full link (`[teamflow] Setup code: …` and `[teamflow] Open …/setup?code=… to create the admin account.`). |

The file is deleted as soon as the admin account exists. If it is missing while setup is still needed, the server makes a new one on the next start or the next visit to `/setup`.

### Code format

Eight characters in two groups of four, `XXXX-XXXX`, from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O`, `1/I`). Regex `^[A-Z2-9]{4}-[A-Z2-9]{4}$`. Input is forgiving: lower case, spaces or no dash are accepted.

### The link to print

```
<public address>/setup?code=<code>
```

`<public address>` is what the installer knows the server will be reached at (for example `http://192.168.1.50:3000` or `https://teamflow.example.org`). The web page fills the code field from `?code=`. Example:

```
http://192.168.1.50:3000/setup?code=K7QM-2PXD
```

### How an installer reads it

1. Start the service.
2. Wait for `GET /health` to answer.
3. `GET /auth/setup` returns `{ "setup": { "needed": true, "codeRequired": true } }` on a fresh server. If `needed` is `false`, the server already has accounts: print the normal address, no code.
4. Read the code from `TEAMFLOW_SETUP_CODE` (if the installer set it) or `<data dir>/setup-code` (as root or the service user).
5. Print the link, for example:

```
Teamflow is running.
Finish setup in your browser:
  http://192.168.1.50:3000/setup?code=K7QM-2PXD
(The setup code is also in /opt/teamflow/data/setup-code and the service log.)
```

### What .env needs

Only the secrets (`JWT_SECRET`, optionally `TEAMFLOW_SECRETS_KEY`). Installers should **not** write `PUBLIC_URL`, `SMTP_*`, `TEAMFLOW_SITE_NAME` or `TEAMFLOW_INVITE_ONLY`: the setup page and the admin page manage those, and a value in `.env` would win and lock the field ("Set in .env").

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/auth/setup` | none | `{ setup: { needed, codeRequired } }` |
| POST | `/auth/setup/admin` | none, rate-limited | `{ code, name, email, password }` → `201 { user, token }`. `403 setup_code_invalid`, `409 setup_done` |
| POST | `/auth/register` | none | While setup is needed: `409 setup_required` |

`GET /auth/config` also returns `setupNeeded` and `siteName`.

### Admin settings used by setup steps 2–5

Instance admins only. A value set in `.env` wins; saving over it answers `409 setting_set_in_env`.

| Method | Path | Notes |
|--------|------|-------|
| GET / PATCH | `/instance/site` | `{ siteName, publicUrl }`; GET adds `suggestedPublicUrl` (the address the request came in on; `X-Forwarded-*` only with `TEAMFLOW_TRUST_PROXY`) |
| GET | `/instance/checks/public-url?url=` | Fetches `<url>/health` from the server, to check an address before saving it |
| GET / PUT / DELETE | `/instance/mail` | SMTP `{ host, port, security: starttls\|ssl\|none, user, password, from }`. The password is stored encrypted and never returned (`passwordSet`). Omit `password` to keep the saved one |
| POST | `/instance/mail/test` | `{ to? }` (default: you). Answers `{ result: { ok, to, error } }` with the SMTP server's message |
| GET / PATCH | `/instance/signup` | `{ inviteOnly }` |
| GET / PATCH | `/instance/setup-checklist` | What's done and what's left. PATCH `{ emailSkipped?, storageReviewed?, dismissed? }` |
