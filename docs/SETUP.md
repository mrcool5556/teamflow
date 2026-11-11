# First-time setup

A brand-new server (no accounts at all) is set up in the browser at `/setup`. The person installing it creates the admin account there, using a **one-time setup code**, so a stranger who finds the server first cannot claim it.

Once any account exists, `/setup` is closed for good: the server refuses a second setup (`409 setup_done`) and the web app sends `/setup` to the login page. Existing servers never see it.

## The setup page

| Step | URL | What it does |
|------|-----|--------------|
| 1. Admin account | `/setup?code=…` | Name, email, password and the setup code. Signs the new admin in. Only while the server has no accounts. |
| 2. Name and address | `/setup/site` | Site name (default Teamflow) and public address, prefilled from the address in the browser. **Check** asks the server to fetch `<address>/health`. |
| 3. Email | `/setup/email` | SMTP server, port, security, login, sender. **Send a test to me** saves and sends. **Skip for now** is fine: password resets then need an admin. |
| 4. Storage and sign-up | `/setup/storage` | Upload cap per Flow (1 GB), Flows per person (3), stop uploads below (2 GB free), and who can sign up. |
| 5. Checklist | `/setup/done` | What's done and what's left, with links. Also shown on the server admin Overview until everything is done or the card is dismissed. |

The account made in step 1 is the **Server Owner** ([AUTH.md](AUTH.md#server-owner-and-trusted-admins)): every power, and the only one who can add trusted admins. Steps 2–5 are ordinary admin settings: the Owner (or a trusted admin with the matching power) can come back to any of them later, and the admin can leave the wizard at any point. A field that `.env` sets shows **Set in .env** and is read-only. On a phone the step list becomes a progress bar.

The login page sends visitors to `/setup` while the server has no accounts.

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

Each needs its server power (Site & email, Sign-up rules, Flows); any power reads the checklist. A value set in `.env` wins; saving over it answers `409 setting_set_in_env`.

| Method | Path | Notes |
|--------|------|-------|
| GET / PATCH | `/instance/site` | `{ siteName, publicUrl }`; GET adds `suggestedPublicUrl` (the address the request came in on; `X-Forwarded-*` only with `TEAMFLOW_TRUST_PROXY`) |
| GET | `/instance/checks/public-url?url=` | Fetches `<url>/health` from the server, to check an address before saving it |
| GET / PUT / DELETE | `/instance/mail` | SMTP `{ host, port, security: starttls\|ssl\|none, user, password, from }`. The password is stored encrypted and never returned (`passwordSet`). Omit `password` to keep the saved one |
| POST | `/instance/mail/test` | `{ to? }` (default: you). Answers `{ result: { ok, to, error } }` with the SMTP server's message |
| GET / PATCH | `/instance/signup` | `{ inviteOnly }` |
| GET / PATCH | `/instance/setup-checklist` | What's done and what's left. PATCH `{ emailSkipped?, storageReviewed?, dismissed? }` |

## Lost the link or the code

- Look in `<data dir>/setup-code` (on LXC `/opt/teamflow/data/setup-code`), or in the service log: `journalctl -u teamflow | grep "Setup code"`. On Windows the server window or `data\setup-code` in the install folder.
- Deleting the file and restarting makes a new code (the old one stops working).
- The page only works while the server has **no accounts**. If someone else got there first, stop the service, move the database aside (`data/teamflow.db*`), start again and use the new code.

## Servers that already have accounts

Nothing changes for them: `/setup` is closed, nobody is asked for a code, and every team, role and admin flag stays as it was. Values in `.env` (`PUBLIC_URL`, `SMTP_*`, `TEAMFLOW_INVITE_ONLY`) keep working and show as **Set in .env** on the admin page. Server admins see the setup checklist card on the Overview once and can dismiss it.

Accounts made before the welcome page keep the **General** team registration used to create. New sign-ups get no team; they Create a Flow or Join a Flow on `/welcome`.
