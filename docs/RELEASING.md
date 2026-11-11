# Releasing Teamflow

Servers update from prebuilt releases on GitHub, not from git. A release is made by pushing a
tag. Only George tags.

## Cut a release

1. Set `version` in the root `package.json` to the new version (for example `0.2.0`) and commit
   it on `main`.
2. Tag with the release notes as the tag message. They become the GitHub release text and the
   "What's new" list on the Updates page:
   ```bash
   git tag -a v0.2.0 -m "- One-click updates
   - Setup page for new servers"
   git push origin v0.2.0
   ```
3. The **Release** workflow (`.github/workflows/release.yml`) then:
   - checks that the tag matches `package.json`, and builds and tests everything;
   - builds `teamflow-vX.Y.Z-linux-x64.tar.gz` on Ubuntu 22.04 and `…-win-x64.zip` on
     Windows. Each one is unpacked, migrated and started on a throwaway database as a smoke test;
   - builds the Windows app installer `TeamflowSetup-vX.Y.Z.exe` from the zip;
   - adds the one-line installers (`install.sh`, `proxmox.sh`, `install.ps1`) and `SHA256SUMS`;
   - records build provenance (`actions/attest-build-provenance`), so anyone can check a file
     with `gh attestation verify <file> --repo mrcool5556/teamflow`;
   - publishes the GitHub release.

A tag with a suffix (`v0.3.0-rc.1`) is published as a **pre-release**. Servers only offer it when
Advanced → Release channel is set to Pre-release. For those tags the `package.json` version is
compared without the suffix.

## Dry run

Actions → Release → **Run workflow** with a version builds and smoke-tests every file and keeps
them as workflow artifacts. Nothing is published.

To build locally for this machine's platform:

```bash
pnpm install --frozen-lockfile
node scripts/package-release.mjs --version 0.2.0
node scripts/smoke-release.mjs out/stage --expect-version 0.2.0
```

## A bad release

Edit the release on GitHub and tick **Set as a pre-release**. Stable servers stop offering it
straight away, because the update check skips pre-releases on the stable channel. Then tag a fixed
patch version. Don't delete a release that servers may already be running. Its tarball is what
their rollback copy came from.

## What is in a release

| Path | What |
| --- | --- |
| `version.json` | `{ version, commit, builtAt, platform }`, read by `/health` and the Updates page |
| `apps/server/dist/` | the server; `migrate.js` updates the database schema |
| `node_modules/` | production dependencies at the lockfile's versions, including `better-sqlite3`'s native binary for this platform |
| `apps/web/dist/` | the web app, served by the server |
| `deploy/` | that platform's scripts (update, backup, service) |

Only x64 is built. Linux needs glibc 2.35 or newer (Debian 12, Ubuntu 22.04+); Alpine is not
supported. The release must run on Node 20, because `better-sqlite3` is built for its ABI.
