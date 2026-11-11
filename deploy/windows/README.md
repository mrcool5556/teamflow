# Teamflow on Windows

Windows 10/11, x64. Teamflow runs a prebuilt release with its own Node 20; nothing is built on the PC and no git checkout is needed. No Docker.

Two ways to install, both covered step by step in [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#setup-a-windows):

- **The Teamflow app**: `TeamflowSetup-vX.Y.Z.exe` from the [latest release](https://github.com/mrcool5556/teamflow/releases/latest). Per user, no admin, lives in the tray.
- **One PowerShell line**, with an optional Windows service:

  ```powershell
  irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex
  ```

## "Windows protected your PC"

The app and scripts are not code-signed yet. SmartScreen shows **Windows protected your PC** for `TeamflowSetup-…exe`: click **More info**, then **Run anyway**. To check the file first, compare its hash with `SHA256SUMS` on the release page:

```powershell
Get-FileHash .\TeamflowSetup-v0.2.0.exe     # must match the line for this file in SHA256SUMS
```

The release also has a GitHub build attestation: `gh attestation verify .\TeamflowSetup-v0.2.0.exe --repo mrcool5556/teamflow` proves it was built by this repository's release workflow.

## Layout

| Folder | What |
|--------|------|
| `%LOCALAPPDATA%\Teamflow` | The app, and the one-liner when not elevated |
| `%ProgramData%\Teamflow` | The one-liner run as administrator (service install) |

Inside:

```text
.env                    settings and secrets (kept on update)
data\                   teamflow.db, uploads\, maintenance.log, logs\ (kept)
backups\                backups (keep settings: Server admin; default 10 database, 1 uploads)
node\node.exe           Teamflow's own Node 20
releases\v0.2.0\        unpacked releases (the newest two are kept)
current  ->             junction to releases\v0.2.0
```

## Who keeps the server running

Exactly one of these starts node and restarts it when it stops:

- **The Teamflow app** (tray). Quit in the tray stops the server.
- **The Teamflow service** (NSSM), from `install.ps1 -Service` or `install-service.ps1`. Starts at boot, no one needs to be signed in. Logs in `data\logs\service.log`.
- **`start.ps1`**: the one-liner without the service starts it hidden at sign-in (a Startup shortcut) and adds a Start-menu shortcut.

They agree on one rule: while `data\.update.lock` holds the PID of a running update or restore, node stays stopped; when the lock goes, the new version starts.

## Scripts

All in `<install folder>\current\deploy\windows\`. Run them with `powershell -ExecutionPolicy Bypass -File <script>`. Settings → Updates runs the same scripts.

| Script | What |
|--------|------|
| `update.ps1` | Download the newest release (or `--version X.Y.Z`), check its SHA-256, back up the database, migrate, switch `current`, restart, wait for `/health`; rolls back to the previous release and database if anything after the stop fails. `--channel prerelease`, `--backup-full`, `--reinstall`, `--allow-downgrade` |
| `backup.ps1` | Online database backup to `backups\` (safe while Teamflow runs); without `--db-only` also zips `data\uploads\`. Then deletes the oldest automatic backups beyond the keep settings in `data\backup-settings.json` ([details](../../docs/SELF-HOSTING.md#backup-retention)); checkpoints are never deleted |
| `restore.ps1 --file <name>` | Back up the current database, stop, put the backup back, start, check |
| `start.ps1` / `stop.ps1` | Run the supervisor in a window (Ctrl+C stops it) / stop the service, app-started or `start.ps1` server |
| `install-service.ps1` | Register the **Teamflow** service (elevated; NSSM from PATH or winget) |

Every script prints the same log lines as the Linux ones (`STEP …`, `FAIL <code> …`, `DONE <version>`, `BACKUP …`, `RESTORED …`) and appends them to `data\maintenance.log`.

## Firewall

Other PCs reach Teamflow on `http://<this PC's address>:3000`. Windows Firewall blocks that until you allow it: the elevated one-liner offers a rule (`-Firewall` adds it without asking), or add one yourself:

```powershell
New-NetFirewallRule -DisplayName "Teamflow" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

## From a git checkout

Older installs ran from a clone (`D:\teamflow`, built with the old `deploy\windows\install.ps1`). Stop that server, then run the one-liner with `-From D:\teamflow`: it copies `.env`, the database and uploads into the new install folder and leaves the old folder as it was. `update.ps1` in a checkout says so instead of pulling.

The checkout scripts (`install.ps1`, `clone-install.ps1`, `_common.ps1` in this folder, and `start.ps1` / `backup.ps1` without a release around them) still work for development; see the [README quick start](../../README.md#quick-start-development).

## Discord bot

The bot service buttons are Linux-only. On Windows run the bot with `pnpm --filter @teamflow/discord-bot start` from a checkout.

See also the [production checklist](../../docs/SELF-HOSTING.md#production-checklist).
