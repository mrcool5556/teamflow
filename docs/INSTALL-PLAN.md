# Install & update plan

Status: **design only, 2026-11-09.** Nothing here is built yet. George picks the options in
[Decisions for George](#decisions-for-george) first. Mock-up of the new Updates page:
[`docs/mockups/simple-update-v1.html`](mockups/simple-update-v1.html).

## Goal

| Today | After this plan |
| --- | --- |
| Clone by hand, run `install`, hand-edit `.env` for `JWT_SECRET` / `TEAMFLOW_SECRETS_KEY`, run the sudo setup separately, and on Proxmox create the CT by hand first | One line per platform: Proxmox host, Linux, Windows. A Windows app with a normal installer |
| Updating means `git pull` + `pnpm install` + `pnpm -r build` on the server: slow, needs about 2 GB of RAM, and fails on small CTs | Download a prebuilt release, verify it, swap it in, migrate, restart, and roll back on failure. Takes about 30 s and very little RAM |
| The Updates page shows sudo pills, host status, two backup buttons, two update buttons and a branch field | One “Update to vX.Y.Z” button. Everything else sits under a collapsed **Advanced** section |
| A new server shows the login screen; the first account to register becomes admin | The installer hands off to the first-time setup page and the “Create a Flow / Join a Flow” welcome (Admin & Spaces lane, branch `onboarding`) |

## What exists today (read before building)

- **Updates UI:** `apps/web/src/components/ServerMaintenanceSettingsSection.tsx`, mounted by
  `routes/settings/UpdatesPanel.tsx` (`/settings/updates`) and `routes/admin/ServerSections.tsx`
  (`/admin/updates`).
- **Server:** `apps/server/src/routes/maintenance.ts` → `lib/maintenance.ts` (runs the root-owned
  scripts through `sudo -n`, reads `data/maintenance.log`) and `lib/versionInfo.ts` (`git ls-remote`
  against origin). In-app maintenance is turned off on `win32`.
- **Steps:** `MAINTENANCE_UPDATE_STEPS` and `inferUpdatePhase` in `packages/core/src/maintenance.ts`
  infer the phase by matching log lines.
- **Linux:** `deploy/proxmox-lxc/install.sh` needs an existing checkout. It apt-installs
  `postgresql` (unused), builds on the box, and copies `.env.example` without generating secrets.
  `update.sh` does git pull → build → migrate. `setup-maintenance-sudo.sh` copies scripts to
  `/usr/local/lib/teamflow` and writes the sudoers rule. The service is
  `WorkingDirectory=/opt/teamflow`, `ExecStart=node /opt/teamflow/apps/server/dist/index.js`.
- **Windows:** `deploy/windows/install.ps1`, `clone-install.ps1`, `start.ps1`, `update.ps1`,
  `install-service.ps1` (NSSM). These need git, Node and pnpm already installed and build locally.
- **Paths:** the server finds the web bundle relative to its own file
  (`config.ts`: `here/../../web/dist`), so a release folder can live anywhere. The database path
  comes from `DATABASE_URL=file:./data/teamflow.db`, relative to the working directory.
- **Migrations:** `pnpm db:migrate` runs `tsx src/migrate.ts`, and tsx is a dev dependency. A release
  needs the compiled `packages/db/dist/migrate.js` plus `init.sql` next to it. tsc does not copy
  `.sql` files, so check this in step 1.
- **Repo:** `github.com/mrcool5556/teamflow` is public and has no releases yet.

## The plan

Legend: ⏳ = waits for the `onboarding` branch (first-time setup page). 🔒 = George only.

### 1. Groundwork in the app (small, no behaviour change)
1. Read the version from one place. The tag sets `package.json` `version` at build time, and the
   build writes `version.json` (`{ version, commit, builtAt, platform }`) into the release.
2. Make `/health` return `{ ok, version }`. The reconnect overlay waits for the new version.
3. Make migrations runnable without tsx: ship `packages/db/dist/migrate.js` and copy `init.sql`
   into `dist`. Add a `teamflow-migrate` entry to the release.
4. Add `scripts/package-release.mjs`. It builds, runs `pnpm --filter @teamflow/server deploy --prod
   out/server` (a self-contained production `node_modules` with the workspace packages inlined),
   copies `apps/web/dist`, the `deploy/` scripts and `version.json`, then tars or zips the result.
   It runs the same way locally and in CI.
5. **Remove PostgreSQL** from `install.sh`, both the apt package and the `createuser`/`createdb`
   block. Also drop the “Phase 2 Postgres” branch and `build-essential python3`, which were only
   needed for building better-sqlite3 on the box. This step does not depend on anything else, so it
   can ship first.

### 2. Prebuilt releases (GitHub Actions)
1. **Version scheme:** SemVer tags `vX.Y.Z`, staying in 0.x until George calls it 1.0. A
   `vX.Y.Z-rc.N` tag is a pre-release and only appears on the “Pre-release” channel. No date
   versions. Changelog: the GitHub release body, written from the tag's annotated message or
   `CHANGELOG.md`.
2. **Workflow** `.github/workflows/release.yml`, run on `push: tags: ['v*']`. It runs `pnpm test`
   once, then builds a matrix:

   | Asset | Runner | Notes |
   | --- | --- | --- |
   | `teamflow-vX.Y.Z-linux-x64.tar.gz` | `ubuntu-22.04` | glibc 2.35 works on Debian 12 and Ubuntu 22.04+ |
   | `teamflow-vX.Y.Z-linux-arm64.tar.gz` | `ubuntu-22.04-arm` | for Pi and ARM servers. Optional, see decisions |
   | `teamflow-vX.Y.Z-win-x64.zip` | `windows-2022` | Windows one-liner and portable zip |
   | `TeamflowSetup-vX.Y.Z.exe` | `windows-2022` | standalone app (step 9) |
   | `SHA256SUMS` | — | one line per asset |
   | `install.sh`, `install.ps1`, `proxmox.sh` | — | so one-liners use `releases/latest/download/…` |

   Each build job runs `pnpm install --frozen-lockfile` on its own OS and architecture, so
   better-sqlite3's prebuilt `.node` matches that platform. It then runs `package-release.mjs` and
   a **smoke test**: unpack the release, start it on a temporary database, `curl /health`, stop.
3. **Integrity:** `SHA256SUMS` catches broken downloads. Against a tampered release, add
   GitHub artifact attestations (`actions/attest-build-provenance`, free for public repos). The
   updater can check them later with `gh attestation verify`. Optional, see decisions.

### 3. Release layout on disk and the new `update.sh`
1. **Layout (Linux):**
   ```
   /opt/teamflow/
     .env                 # kept forever, never inside a release
     data/                # db, uploads, backups, maintenance.log
     releases/v0.5.0/     # unpacked tarballs, keep the newest 2
     releases/v0.5.1/
     current -> releases/v0.5.1
   ```
   The unit file changes to `ExecStart=/usr/bin/node /opt/teamflow/current/apps/server/dist/index.js`
   and keeps `WorkingDirectory=/opt/teamflow`, so `./data` resolves to the same place as today.
2. **`update.sh [--version X.Y.Z] [--backup-full] [--skip-backup]`**, with these steps. Each step
   writes `STEP <name>` to the log so the UI stops guessing from log text:
   1. `backup`: run `backup.sh --db-only`, or `--full` with `--backup-full`.
   2. `download`: fetch the tarball and `SHA256SUMS` from the GitHub release and verify them. Check
      free disk first (needs 2× the tarball size).
   3. `install`: unpack to `releases/vX.Y.Z`, then stop the service, run
      `node releases/vX.Y.Z/…/migrate.js`, and point `current` at the new release with
      `ln -sfn` (atomic).
   4. `restart`: start the service and refresh the sudo scripts from the *new* release.
   5. `check`: poll `/health` until it reports the new version, for up to 60 s.
   - **Rollback:** if `install`, `restart` or `check` fails, point `current` back, restore the
     pre-update database backup when a migration already ran, start the old version, and write a
     `FAIL <code> <one-line message>` line. Failure codes are `network`, `checksum`, `disk`,
     `migrate`, `health` and `unknown`. Each maps to the one-line fix in the mock-up.
   - Keep the last 2 releases and the last 10 database backups. Prune older ones after a
     successful update.
   - `--branch` and the git pull path are removed. Developers keep using a checkout and `pnpm dev`.
3. **Converting old git installs:** when `install.sh` finds `/opt/teamflow/.git`, it moves the
   checkout aside to `/opt/teamflow/legacy-git` and keeps `.env` and `data/` where they are.
   It then installs the latest release into the new layout. Run on a test CT first.
4. 🔒 **CT998 (production)** is converted last, by George or with his explicit go-ahead in that
   session. It runs the new installer over SSH after a full backup.

### 4. How the app learns about new versions
1. Replace the `git ls-remote` check in `versionInfo.ts` with
   `GET https://api.github.com/repos/mrcool5556/teamflow/releases` (unauthenticated, 60/h limit).
   Cache the result for 6 h in memory plus `data/update-check.json`. “Check now” bypasses the cache.
   Filter by channel: stable skips pre-releases.
2. Store `latest = { version, notes, publishedAt, sizeBytes }` and compare SemVer against the
   current `version.json`.
3. The server computes `state`: `up-to-date | available | updating | failed | not-set-up`.
   `not-set-up` means the maintenance sudo is missing, the install is not a release install, or
   maintenance is disabled.
4. Setting `TEAMFLOW_UPDATE_CHECK=false` turns the outbound check off for air-gapped installs.
5. An instance admin who has an update waiting sees a small dot on **Server admin → Updates**. No
   e-mails or toasts.

### 5. Simple Updates page (follows the mock-up)
1. Change `POST …/maintenance/update` to take `{ version, backupFiles? }`. `branch` is removed and
   `skipBackup` is no longer exposed in the UI.
2. Rewrite `ServerMaintenanceSettingsSection.tsx` as **StatusCard** (the 5 states) plus
   **Advanced** (`<details>`, closed by default): update options, backups and restore, host facts,
   logs.
3. Add a reconnect overlay: when polls fail during `restart`, show “Back in a moment”, poll
   `/health` every 2 s, and hard-reload once the new version answers. After 3 minutes, switch to
   the “Still not back” help.
4. Replace `MAINTENANCE_UPDATE_STEPS` with 5 steps: Backup · Download · Install · Restart · Check.
   They are read from `STEP` lines, not inferred.
5. Add **Restore last backup** in Advanced and in the Failed state. It needs a `restore.sh` with a
   sudoers entry, stops the service, swaps the database and starts the service again.
6. Tests: a component test for each state, plus server tests for state calculation and
   failure-code parsing.

### 6. Linux one-liner (Debian 12 / Ubuntu 22.04+)
```bash
curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash
```
1. Checks: root, Debian or Ubuntu, systemd, x64 or arm64, and at least 1 GB free. It stops with a
   one-line reason when a check fails.
2. Installs Node 20 from NodeSource only if `node -v` is missing or older than 20, plus
   `curl ca-certificates sudo`. No git, no build tools, no PostgreSQL.
3. Creates the `teamflow` user and the `/opt/teamflow` layout, then downloads, verifies and unpacks
   the latest release (or `TEAMFLOW_VERSION=…`).
4. **Secrets:** writes `.env` only for keys that are missing. `JWT_SECRET` and
   `TEAMFLOW_SECRETS_KEY` come from `openssl rand -hex 32`. Also sets `PUBLIC_URL` from the first
   LAN IP and `PORT` (default 3000, `TEAMFLOW_PORT=` overrides). It never changes an existing
   value, and above all never regenerates `TEAMFLOW_SECRETS_KEY`, which would make stored
   integration secrets unreadable. `.env` is mode 600, owned by `teamflow`.
5. Runs migrations, installs the systemd unit, runs `setup-maintenance-sudo.sh` (failure is
   fatal, no more `|| true`), and enables and starts the service.
6. Health check: polls `/health` for up to 60 s and prints `journalctl` help on failure.
7. ⏳ Prints `Open http://<ip>:3000 to finish setup` and, if the onboarding lane wants one, a
   one-time **setup code** (see decisions). Until `onboarding` lands, it says “register the
   first account; it becomes the instance admin”.
8. **Safe to re-run:** each step checks before acting. If the release is already present it skips
   the download; if `.env` has a key it keeps it. On an existing install, a re-run is a repair:
   it reinstalls sudo and the unit and updates to latest only with `--update`.
9. Optional prompt (TTY only) for SMTP, as today via `teamflow-smtp`.

### 7. Proxmox host one-liner
```bash
bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)"
```
Run on the PVE host as root. It uses `bash -c "$(…)"` rather than `| bash` so the prompts can read
the TTY.
1. Checks: `pveversion` exists and the user is root.
2. Prompts, with defaults (Enter accepts all; `--yes` and env vars make it non-interactive):
   CT ID = `pvesh get /cluster/nextid`, hostname `teamflow`, storage = the first that allows
   `rootdir` (usually `local-lvm`), disk 8 GB, RAM 1024 MB, 2 cores, bridge `vmbr0`, IP DHCP or
   static, unprivileged yes, start at boot yes.
3. Template: `pveam update`, pick the newest `debian-12-standard` with `pveam available`, and
   `pveam download local …` if it is not already cached.
4. `pct create … --unprivileged 1 --features nesting=1 --onboot 1`, then `pct start`, then wait for
   the network (DHCP lease, `ping` of github.com).
5. `pct exec <id> -- bash -c "curl -fsSL …/install.sh | bash"`, which is step 6 inside the CT.
6. ⏳ Prints the CT ID, the IP and `Open http://<ip>:3000 to finish setup` (plus the setup code).
7. Re-run safety: refuses to touch an existing CT ID unless it already runs Teamflow, and then
   only offers to re-run the installer inside it.
8. Never touches CT998. The script only creates new CTs and the default ID is the next free one.

### 8. Windows one-liner
```powershell
irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex
```
1. Node 20: if `node -v` is missing or older than 20, run
   `winget install OpenJS.NodeJS.LTS` pinned to a 20.x version (check the exact winget id and version syntax when building; LTS is now 22+), or fall back to the official Node 20 MSI. Refresh PATH in
   the session. Git and pnpm are not needed.
2. Downloads and verifies `win-x64.zip`, then unpacks it to `%ProgramData%\Teamflow\releases\vX.Y.Z`
   with a `current` junction. Data and `.env` go in `%ProgramData%\Teamflow\`, which an elevated
   prompt can write. When not elevated, it installs under `%LOCALAPPDATA%\Teamflow`.
3. Secrets: `[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)` → hex, with the same
   keep-what-exists rule as Linux.
4. Runs migrations, then asks **“Run Teamflow as a Windows service so it starts with the PC? [Y/n]”**.
   Yes installs the service (see decisions: NSSM download or `node-windows`/WinSW). No adds a
   Start-menu shortcut that runs `start.ps1`.
5. Opens a Windows Firewall rule for the port only after a prompt, since it is needed for LAN use.
6. Health check, then `Start-Process http://localhost:3000`. ⏳ The browser lands on the setup
   page.
7. **In-app updates on Windows:** today `lib/maintenance.ts` refuses `win32`. Add an
   `update.ps1` with the same steps and `STEP`/`FAIL` lines. The server spawns it detached, and it
   stops the service, swaps the junction, migrates, starts the service and checks health. If
   Teamflow runs as a service under LocalSystem, no extra rights are needed. If it was started by
   hand, the updater restarts it the same way.
8. Safe to re-run, same as step 6.8.

### 9. Windows standalone app
Teamflow is a server that other people's browsers connect to, so the “app” is mainly a way to run
that server on a Windows PC without a terminal: install, start with Windows, a tray icon, update.

| Option | What it is | Good | Bad |
| --- | --- | --- | --- |
| **A. Installer + bundled Node + tray** (recommended) | `TeamflowSetup.exe` built with Inno Setup. It contains the `win-x64` release, a pinned `node.exe` (20.x, signed by OpenJS) and a small tray program (C# WinForms on .NET Framework 4.8, which every Windows 10/11 machine already has) | About 35 MB. Reuses the exact `win-x64` release and updater from step 8. The tray covers Open Teamflow, Start with Windows, Check for updates / Update to vX.Y.Z, Open data folder, Logs and Quit. Uninstaller in Apps & features. LAN users just use the browser | Two small extra codebases: the Inno script and the tray. The tray needs its own signing to avoid SmartScreen |
| B. Electron | A Chromium window wrapping the web app, with the server in the main process | Real window, `electron-updater` | About 150 MB. better-sqlite3 must be rebuilt for Electron's ABI, which is a different binary from the Node 20 server build, so it doubles the native build matrix. The window adds nothing for LAN users, who still use a browser |
| B′. Tauri | WebView2 window plus Node sidecar | Small shell | Still has to bundle `node.exe` as a sidecar for the Hono server, and adds a Rust toolchain to CI. More moving parts than A for the same result |
| C. Portable zip | `win-x64.zip` + `node.exe` + `Start Teamflow.cmd` | Free, since it falls out of step 2. No install, runs from a USB stick | No auto-start, no tray, updates by hand. Fine as a bonus download, not as “the app” |

**Recommendation: A.** It is the only option that gives George a normal Windows app (installer,
tray, starts with Windows, one-click update) without a second native build or a second runtime.
C ships for free alongside it. If George later wants a dedicated window rather than a browser
tab, the tray can open the URL in an Edge `--app=` window, which looks like a native window and
needs no Electron.

How A runs the server: as a per-user process started by the tray at login, which needs no admin
rights and no service. Install offers “Run as a service instead” for an always-on box, using the
same service path as step 8.4. Updates: the tray (or the in-app button) runs the step 8.7 updater
on `%LOCALAPPDATA%\Teamflow`, then restarts the server. The tray program updates itself on the next
launch from the same release.

### 10. Docs (with each step, not at the end)
- Each step updates `docs/SELF-HOSTING.md`, `docs/DEPLOYMENT.md`, `deploy/proxmox-lxc/README.md`,
  `deploy/windows/README.md`, `create-lxc.md`, the README quick start and `docs/STATUS.md`.
- The Docs lane is editing those files now on `install-docs-refresh`. This lane does not touch them
  until that branch is merged; until then, notes go to the shared notes folder.
- Add `docs/RELEASING.md`, covering how to cut a tag, what the workflow produces and how to yank a
  bad release (mark it pre-release; the updater skips it).

## Order and dependencies

```
1.5 Remove PostgreSQL ─────────────── (independent, first)
1 Groundwork ─► 2 Releases ─► 3 update.sh + layout ─► 4 Version check ─► 5 Simple Updates page
                     │                 │
                     │                 ├─► 6 Linux one-liner ─► 7 Proxmox one-liner     ⏳ final hand-off
                     │                 └─► 8 Windows one-liner ─► 9 Windows app (A)      ⏳ final hand-off
                     └─ (C portable zip falls out of 2)
3.4 🔒 CT998 conversion: last, after 3–6 have run on a test CT
```

- **Waits for `onboarding` (⏳):** only the *last line* of 6, 7, 8 and 9, meaning where the
  installer sends the browser and whether it prints a setup code. Everything else can be built and
  tested now, and the installers fall back to “register the first account”.
- **Contract to agree with the Admin & Spaces lane:** (a) a fresh install with zero users serves the
  setup page at `/`; (b) optionally, `TEAMFLOW_SETUP_CODE` in `.env` is required by that page and
  deleted after use. The installers only write and print it.
- 5 can start in parallel with 6–8 once 4's status shape is fixed.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Native better-sqlite3 binaries** per platform and arch (ABI 115, glibc) | A release built on the wrong OS crashes on start | Build each asset on its own OS and arch runner (step 2.2), smoke-test it in CI, and build Linux on Ubuntu 22.04 for older glibc. Alpine/musl, 32-bit and Windows ARM are unsupported and the installer refuses them |
| Node ABI drift (someone runs Node 22) | Same crash | Installers pin Node 20. The release checks `process.versions.modules === "115"` at start and prints a clear message |
| **SmartScreen** on `TeamflowSetup.exe` and the tray exe | “Windows protected your PC” scares people off | Sign with **Azure Trusted Signing** (about $10/month, builds SmartScreen reputation quickly) or an OV certificate, or ship unsigned with a README note. The `irm \| iex` path has no SmartScreen prompt, but AV tools sometimes flag `iex` one-liners |
| **Code signing** of releases in general | A tampered download would be trusted | HTTPS plus SHA256SUMS now. Attestations or minisign later (decision) |
| GitHub API rate limit (60/h unauthenticated) | The update check fails | 6 h cache, and failures show “couldn't check” rather than an error |
| A migration fails mid-update | Database left half-migrated | Database backup before every update. The rollback restores it automatically when the migration step started |
| A `curl \| bash` installer is half-downloaded | Broken partial run | The whole script is wrapped in `main() { … }; main "$@"` so nothing runs until the last line has arrived |
| Converting CT998 from git to the release layout | Production downtime | Test CT first, full backup, George runs it. `legacy-git` is kept for a manual rollback |
| Teamflow's data folder moves on Windows (`D:\teamflow` → `%ProgramData%`) | Old installs look empty | `install.ps1 -From D:\teamflow` copies `.env` + `data` over. Never automatic |

## Decisions for George

1. **Windows app:** go with option **A** (installer + bundled Node + tray), with the portable zip as
   a free extra? Should the tray open the browser or an Edge `--app` window?
2. **Signing:** pay for Azure Trusted Signing (about $10/month), or ship unsigned for now?
3. **Architectures:** Linux x64 only, or also arm64 (Raspberry Pi and ARM servers)? Windows x64 only?
4. **Setup code:** should installers print a one-time setup code that the first-time setup page
   asks for? It stops someone else on the LAN from claiming admin first. This needs the
   Admin & Spaces lane to agree.
5. **First release:** tag `v0.1.0` from main once steps 1–3 land, or start at `v0.5.0` to signal
   that it is usable?
6. **Windows service tool:** download NSSM (as today), or bundle WinSW (one signed exe, XML config,
   actively maintained)?
7. **Attestations:** add GitHub build attestations now (free) or later?
