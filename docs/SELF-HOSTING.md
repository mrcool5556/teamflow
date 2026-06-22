# Self-hosting Teamflow

Teamflow runs on your hardware. **Teammates only need a browser** — they open your URL and accept an invite. This guide is for the person who runs the server.

## Pick a setup

| Setup | Best for | Install effort | Update command |
|-------|----------|----------------|----------------|
| **[Windows](#windows)** | Dev machine, small team on one PC | Low | `.\deploy\windows\update.ps1` |
| **[Proxmox LXC](#proxmox-lxc)** | Always-on home lab server | Medium | `sudo update` |
| **[Docker](#docker)** | VPS or any host with Docker | Low (if Docker is installed) | `docker compose ... up -d --build` |

All three use the same app: SQLite database in `data/`, API + web UI on port **3000**, config in `.env`.

```text
You (host)                         Teammates
──────────                         ──────────
install once  →  run server  →  https://your-domain
git push      →  update       →  refresh browser
```

---

## Before you install (all platforms)

1. **Clone the repo** (or use our install scripts that clone for you):
   ```bash
   git clone https://github.com/mrcool5556/teamflow.git
   ```
2. **Set secrets in `.env`** — at minimum:
   - `JWT_SECRET` — long random string (not the example default)
   - `PUBLIC_URL` — how users reach you, e.g. `https://tasks.example.com`
3. **Optional:** `TEAMFLOW_INVITE_ONLY=true` so only invited people can register.

See the root [`.env.example`](../.env.example) for all variables.

### Remote access

Friends need **HTTPS** on a real domain (or LAN IP for testing). Common pattern:

```text
Browser → Cloudflare / reverse proxy → Teamflow :3000
```

Details: [deploy/relay/README.md](../deploy/relay/README.md)

---

## Windows

**Good for:** running on your gaming/dev PC, testing, Cursor MCP on the same machine.

### Requirements

- Windows 10/11
- [Git](https://git-scm.com/) — `winget install Git.Git`
- [Node.js 20+](https://nodejs.org/) — `winget install OpenJS.NodeJS.LTS`

### Install

**From an existing clone:**

```powershell
cd D:\teamflow
.\deploy\windows\install.ps1
.\deploy\windows\start.ps1
```

**Fresh machine (clone + install):**

```powershell
.\deploy\windows\clone-install.ps1 -RepoUrl "https://github.com/mrcool5556/teamflow.git" -InstallPath "D:\teamflow"
cd D:\teamflow
.\deploy\windows\start.ps1
```

Open http://localhost:3000

After seed, demo login is `demo@teamflow.local` / `changeme123` — change or disable for production.

### Update

```powershell
cd D:\teamflow
.\deploy\windows\update.ps1 -StartAfter
```

Stops the app, backs up `data\teamflow.db`, pulls git, rebuilds, migrates, then starts again.

### Optional: Windows Service

```powershell
.\deploy\windows\install-service.ps1
```

More detail: [deploy/windows/README.md](../deploy/windows/README.md)

---

## Proxmox LXC

**Good for:** dedicated always-on server on Proxmox (what most self-hosters want).

### Requirements

- Proxmox VE with an LXC container
- Debian 12+ or Ubuntu 24.04
- ~2 CPU, 2–4 GB RAM, 20 GB disk

### Install

1. Create an LXC — see [deploy/proxmox-lxc/create-lxc.md](../deploy/proxmox-lxc/create-lxc.md)
2. SSH into the container:

```bash
git clone https://github.com/mrcool5556/teamflow.git /opt/teamflow
cd /opt/teamflow
sudo bash deploy/proxmox-lxc/install.sh
```

3. Edit production config:

```bash
nano /opt/teamflow/.env
# JWT_SECRET=...
# PUBLIC_URL=https://tasks.example.com
# DATABASE_URL=file:./data/teamflow.db
```

```bash
systemctl restart teamflow
curl http://localhost:3000/health
```

`install.sh` installs Node 20, pnpm, builds the app, sets up systemd, and registers the **`update`** command.

### Update

```bash
sudo update
```

Same as `sudo teamflow-update` — backup DB → `git pull` → build → migrate → restart.

If `update` is missing (older install):

```bash
sudo install -m 755 /opt/teamflow/deploy/proxmox-lxc/update.sh /usr/local/bin/teamflow-update
sudo ln -sf teamflow-update /usr/local/bin/update
```

**Important:** `/opt/teamflow` must be a **git clone** (have a `.git` folder). Snapshot installs without git cannot `git pull`; re-clone once and restore `.env` + `data/`.

More detail: [deploy/proxmox-lxc/README.md](../deploy/proxmox-lxc/README.md)

---

## Docker

**Good for:** a VPS (Hetzner, DigitalOcean, etc.) or any machine where you already use Docker and do not want Node/pnpm on the host.

### What Docker does here (30-second version)

- **Image** — a packaged copy of Teamflow (built from the repo).
- **Container** — the running instance of that image.
- **Volume** — persistent folder for your database (`data/`), kept when the container is recreated.

You do not need to learn much more than `docker compose up` for day-to-day use.

### Requirements

- [Docker Engine](https://docs.docker.com/engine/install/) + [Docker Compose](https://docs.docker.com/compose/install/) v2

### Install

```bash
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow/deploy/docker
cp .env.example .env
nano .env   # set JWT_SECRET and PUBLIC_URL
docker compose up -d --build
```

Open http://localhost:3000 (or your mapped port).

Check logs:

```bash
docker compose logs -f
```

Health:

```bash
curl http://localhost:3000/health
```

### Update

```bash
cd teamflow
git pull
cd deploy/docker
docker compose up -d --build
```

The entrypoint runs migrations on each start; your data stays in the Docker volume `teamflow-data`.

### Backup

```bash
docker compose exec teamflow cp /app/data/teamflow.db /app/data/teamflow.db.bak
# Or copy from the volume on the host (path depends on Docker setup)
```

More detail: [deploy/docker/README.md](../deploy/docker/README.md)

---

## Inviting teammates (all setups)

1. Log in on your **public** `PUBLIC_URL` (not just localhost).
2. Create a team → **Settings → Team → Create invite link**.
3. Send friends the site URL + invite link.
4. They register, join, and bookmark the page (or “Open as window” in Chrome/Edge).

No install on their side.

---

## Environment variables (production)

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | Yes | Signs login tokens — use a long random value |
| `PUBLIC_URL` | Yes (public host) | Correct links in invites and emails |
| `DATABASE_URL` | Yes | `file:./data/teamflow.db` for SQLite (default) |
| `SERVE_WEB` | Auto on LXC/Docker | Serves built web UI from the API port |
| `TEAMFLOW_INVITE_ONLY` | No | `true` = registration only via invite |
| `PORT` / `HOST` | No | Default `3000` / `0.0.0.0` |

Discord bot and MCP use separate docs: [discord-bot.md](discord-bot.md), [MCP.md](MCP.md).

---

## Moving your board to another machine

Copy these two things:

- `data/teamflow.db` (and `-wal` / `-shm` if present — stop the server first)
- `.env` (secrets and `PUBLIC_URL`)

Then install on the new machine and replace `data/` + `.env` before starting.

---

## Development (not production)

```powershell
pnpm install
cp .env.example .env
pnpm db:setup
pnpm dev
```

- Web: http://localhost:5173  
- API: http://localhost:3000  

---

## Future: Community Scripts (Proxmox)

A [Community Scripts](https://community-scripts.org/) install will wrap the LXC flow: one command on the Proxmox host to create the container, and `update` inside the LXC. The underlying steps stay the same as [Proxmox LXC](#proxmox-lxc) above.

---

## Quick reference

| Action | Windows | LXC | Docker |
|--------|---------|-----|--------|
| Install | `install.ps1` | `install.sh` | `docker compose up -d --build` |
| Start | `start.ps1` or service | `systemctl start teamflow` | `docker compose up -d` |
| Update | `update.ps1` | `sudo update` | `git pull` + `compose up -d --build` |
| Logs | terminal / Event Viewer | `journalctl -u teamflow -f` | `docker compose logs -f` |
| Config | `.env` in repo root | `/opt/teamflow/.env` | `deploy/docker/.env` |
