# Teamflow — Setup A: Windows self-host

Native Windows install. No Docker.

## What you get

- Node.js API + built web UI on one port (default **3000**)
- SQLite database at `data\teamflow.db`
- Optional Windows Service via NSSM

## Quick start (from repo)

```powershell
cd D:\projects\teamflow
.\deploy\windows\install.ps1
.\deploy\windows\start.ps1
```

Open http://localhost:3000

## Git install (second machine / fresh PC)

Prerequisites: **Git**, **Node 20+**. Push your repo to GitHub (or any git remote) first.

```powershell
# One-time: clone + build + seed
.\deploy\windows\clone-install.ps1 -RepoUrl "https://github.com/you/teamflow.git" -InstallPath "D:\teamflow"

cd D:\teamflow
.\deploy\windows\start.ps1
```

To bring your **existing board** to the new machine, copy `data\teamflow.db` into `D:\teamflow\data\` after install (or before — seed skips if data already exists).

## Git update (day-to-day while actively developing)

On your dev machine: commit + push.

On the server / second PC:

```powershell
cd D:\teamflow
.\deploy\windows\update.ps1
.\deploy\windows\start.ps1
```

`update.ps1` stops the app, backs up the DB, `git pull`, `pnpm install`, `pnpm build`, `pnpm db:migrate` (no re-seed). Add `-StartAfter` to start when done.

## Files

| File | Purpose |
|------|---------|
| `clone-install.ps1` | `git clone` + first-time `install.ps1` |
| `install.ps1` | Install deps, build, migrate, seed |
| `update.ps1` | `git pull` + rebuild + migrate (keeps `data/` and `.env`) |
| `start.ps1` | Run server (foreground) |
| `stop.ps1` | Stop background job |
| `install-service.ps1` | Register NSSM Windows Service |
| `backup.ps1` | Copy SQLite DB to backups folder |
| `env.example` | Environment template |

## Production layout

Default install keeps files in the repo. For a dedicated path:

```powershell
.\deploy\windows\install.ps1 -InstallPath "C:\ProgramData\Teamflow"
```

## Demo login

After seed: `demo@teamflow.local` / `changeme123`

See [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#windows)
