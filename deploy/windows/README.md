# Teamflow — Setup A: Windows self-host

Native Windows install. No Docker.

## What you get

- Node.js API + built web UI on one port (default **3000**)
- SQLite database at `data\teamflow.db`, files in `data\uploads\`
- Optional Windows service via NSSM

Requirements: **Git** and **Node 20** (not 22 or 24; `better-sqlite3` is built for 20). nvm-windows: `nvm install 20.19.2; nvm use 20.19.2`.

## Install (from a clone)

```powershell
cd D:\projects\teamflow
.\deploy\windows\install.ps1        # .env from env.example, pnpm install, build, db migrate
notepad .env                        # set JWT_SECRET to a long random value
```

`install.ps1` creates no demo user: open the site and register; the first account becomes the instance admin. For throwaway demo data: `$env:TEAMFLOW_SEED_DEMO = "1"; pnpm db:seed`.

## Start

```powershell
.\deploy\windows\start.ps1
```

At startup the server loads `TEAMFLOW_ENV_FILE` if set, else `.env` in the app folder if it exists. Variables already in the process environment always win over the file. `start.ps1` points `TEAMFLOW_ENV_FILE` at the repo's `.env` and sets `SERVE_WEB=true`; anything you set in the session first (for example `$env:PORT`) overrides the file. The server refuses to start while `JWT_SECRET` is unset or a placeholder.

Open <http://localhost:3000>.

## Git install (second machine / fresh PC)

```powershell
.\deploy\windows\clone-install.ps1 -RepoUrl "https://github.com/mrcool5556/teamflow.git" -InstallPath "D:\teamflow"
cd D:\teamflow
notepad .env
```

Then start as above. To bring your existing board, stop the server and copy `data\teamflow.db` (plus `-wal`/`-shm`), `data\uploads\` and `.env` (same `JWT_SECRET`) into `D:\teamflow`.

## Update

```powershell
cd D:\teamflow
.\deploy\windows\update.ps1
```

Stops the app, backs up the DB, `git pull`, `pnpm install`, `pnpm build`, `pnpm db:migrate` (no seed). `-StartAfter` then runs `start.ps1`.

## Windows service (NSSM)

```powershell
.\deploy\windows\install-service.ps1
```

The service gets `TEAMFLOW_ENV_FILE=<repo>\.env`, `PORT`, `DATABASE_URL` and `SERVE_WEB=true`; everything else (`JWT_SECRET`, `PUBLIC_URL`, SMTP...) comes from `.env`. After editing `.env`, run `nssm restart Teamflow`.

## Not available on Windows

- Settings → Updates (in-app backup/update) and the Discord bot service buttons are Linux-only. Use `update.ps1` / `backup.ps1` and run the bot with `pnpm dev:discord` or `pnpm --filter @teamflow/discord-bot start`.

## Files

| File | Purpose |
|------|---------|
| `clone-install.ps1` | `git clone` + first-time `install.ps1` |
| `install.ps1` | Install deps, build, migrate (no seed) |
| `update.ps1` | `git pull` + rebuild + migrate (keeps `data/` and `.env`) |
| `start.ps1` | Run the server in the foreground (loads `.env`, sets `SERVE_WEB`) |
| `stop.ps1` | Stop node processes whose command line contains "teamflow" (dev and MCP included) |
| `install-service.ps1` | Register the NSSM service |
| `backup.ps1` | Copy the SQLite DB to a backups folder |
| `env.example` | Environment template |

See [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#setup-a-windows) and the [production checklist](../../docs/SELF-HOSTING.md#production-checklist).
