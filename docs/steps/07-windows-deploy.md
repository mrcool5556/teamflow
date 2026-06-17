# Step 07 — Windows deploy (Setup A)

## Goal

Run Teamflow as a native Windows service with SQLite — no Docker.

## Status: done (2026-06-16)

## Prerequisites

- Steps 01–06 complete
- Node.js 20+
- pnpm (via corepack)

## How to run

```powershell
cd D:\projects\teamflow
.\deploy\windows\install.ps1
.\deploy\windows\start.ps1
```

Open http://localhost:3000 (API + web on one port in production mode).

## Optional: Windows Service (NSSM)

1. Install [NSSM](https://nssm.cc/download)
2. `.\deploy\windows\install-service.ps1`

## Backup

```powershell
.\deploy\windows\backup.ps1
```

## Verify

- [ ] `install.ps1` completes without errors
- [ ] `start.ps1` → http://localhost:3000 shows login
- [ ] Demo login works
- [ ] `backup.ps1` creates file in `data\backups\`

## Files

- `deploy/windows/install.ps1`, `start.ps1`, `stop.ps1`, `install-service.ps1`, `backup.ps1`

## Next step

[08-proxmox-lxc-deploy.md](08-proxmox-lxc-deploy.md) (when moving to always-on server)
