# Teamflow — Setup A: Windows self-host

Native Windows install. No Docker.

## What you get

- Node.js API + built web UI on one port (default **3000**)
- SQLite database at `data\teamflow.db`, files in `data\uploads\`
- Optional Windows service via NSSM

## Requirements

- Windows 10/11 with PowerShell 5.1 or 7
- **Git**: `winget install Git.Git`
- **Node 20** (not 22 or 24; `better-sqlite3` is built for 20): the v20 installer from <https://nodejs.org/en/download>, or nvm-windows `nvm install 20.19.2; nvm use 20.19.2`. Check with `node -v`.
- **pnpm 9**: nothing to install. The scripts use `pnpm` if it is on PATH, otherwise `corepack pnpm` (Corepack ships with Node 20 and runs the pinned 9.15.0).
- Build tools only if the prebuilt `better-sqlite3` binary cannot be downloaded during `pnpm install`: Python 3 and Visual Studio Build Tools with "Desktop development with C++".
- Disk: under 1 GB for the install, plus your data. Uploads pause while the drive holding `data\uploads\` has less than 2 GB free.

PowerShell blocks unsigned scripts by default on Windows clients. Allow them for the current window only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## Install

```powershell
git clone https://github.com/mrcool5556/teamflow.git D:\teamflow
cd D:\teamflow
.\deploy\windows\install.ps1        # .env from env.example, pnpm install, build, db migrate
```

`install.ps1 -Port 8080` writes another port into `.env` (default 3000).

Then set a real secret in `.env`; the server refuses to start with the placeholder. This makes one:

```powershell
-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })
notepad .env                        # paste it as JWT_SECRET=...; set PUBLIC_URL if others connect
```

`install.ps1` creates no demo user. For throwaway demo data: `$env:TEAMFLOW_SEED_DEMO = "1"; pnpm db:seed`.

`clone-install.ps1 -RepoUrl ... -InstallPath ...` does the clone and `install.ps1` in one go, but it lives in the repo, so it is only useful when you already have a copy of it (for example to set up a second folder).

## Start

```powershell
.\deploy\windows\start.ps1
```

Open <http://localhost:3000> (or your port) and **register**. The first account becomes the instance admin; the **Server admin** page is in the account menu.

At startup the server loads `TEAMFLOW_ENV_FILE` if set, else `.env` in the app folder if it exists. Variables already in the process environment always win over the file. `start.ps1` points `TEAMFLOW_ENV_FILE` at the repo's `.env` and sets `SERVE_WEB=true`; anything you set in the session first (for example `$env:PORT`) overrides the file. Stop it with Ctrl+C.

To bring an existing board, stop the server and copy `data\teamflow.db` (plus `-wal`/`-shm`), `data\uploads\` and `.env` (same `JWT_SECRET`) into the new folder.

## Update

```powershell
cd D:\teamflow
.\deploy\windows\update.ps1
```

Runs `stop.ps1`, backs up the DB (`-SkipBackup` skips it), `git pull` (`-Branch name` for another branch), `pnpm install`, `pnpm build`, `pnpm db:migrate` (no seed). `-StartAfter` then runs `start.ps1`.

`stop.ps1` stops **every** node process whose path or command line contains "teamflow", including dev servers and the MCP server. If the Windows service is installed, stop it first with `nssm stop Teamflow` and start it again afterwards.

## Backup

```powershell
.\deploy\windows\backup.ps1                       # to data\backups\teamflow_<date>.db
.\deploy\windows\backup.ps1 -BackupDir E:\backups
```

It copies the database file only. Stop the server first (it does not copy the `-wal` file, so a running server can leave recent changes out), and copy `data\uploads\` yourself.

## Windows service (NSSM)

Needs `nssm.exe` on PATH (<https://nssm.cc/download>).

```powershell
.\deploy\windows\install-service.ps1               # service "Teamflow", port 3000
.\deploy\windows\install-service.ps1 -Port 8080
```

The service gets `TEAMFLOW_ENV_FILE=<repo>\.env`, `PORT` (from `-Port`, which wins over `.env`), `DATABASE_URL` and `SERVE_WEB=true`; everything else (`JWT_SECRET`, `PUBLIC_URL`, SMTP...) comes from `.env`. After editing `.env`, run `nssm restart Teamflow`.

## Not available on Windows

- Server admin → Updates / Settings → Updates (in-app backup and update) and the Discord bot service buttons are Linux-only. Use `update.ps1` / `backup.ps1` and run the bot with `pnpm dev:discord` or `pnpm --filter @teamflow/discord-bot start`.

## Files

| File | Purpose |
|------|---------|
| `clone-install.ps1` | `git clone` + first-time `install.ps1` |
| `install.ps1` | Install deps, build, migrate (no seed) |
| `update.ps1` | Stop, back up, `git pull`, rebuild, migrate (keeps `data/` and `.env`) |
| `start.ps1` | Run the server in the foreground (loads `.env`, sets `SERVE_WEB`) |
| `stop.ps1` | Stop node processes whose path or command line contains "teamflow" (dev and MCP included) |
| `install-service.ps1` | Register the NSSM service |
| `backup.ps1` | Copy the SQLite DB to a backups folder |
| `env.example` | Environment template |

See [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#setup-a-windows) and the [production checklist](../../docs/SELF-HOSTING.md#production-checklist).
