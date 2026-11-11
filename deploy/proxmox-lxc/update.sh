#!/usr/bin/env bash
# Teamflow update: download a prebuilt release, verify it, back up, migrate, switch, restart,
# check, and roll back if anything after the stop fails.
#
# Layout (made by deploy/install/install.sh):
#   /opt/teamflow/.env            settings and secrets (kept)
#   /opt/teamflow/data/           database, uploads, maintenance.log (kept)
#   /opt/teamflow/releases/vX.Y.Z unpacked releases, root-owned; the newest two are kept
#   /opt/teamflow/current      -> releases/vX.Y.Z
#   /opt/teamflow/apps         -> current/apps     (unit files use /opt/teamflow/apps/...)
#   /opt/teamflow/deploy       -> current/deploy
#
# The log goes to data/maintenance.log, which Settings → Updates reads. Machine-readable lines:
#   STEP <download|backup|install|restart|check>
#   FAIL <network|checksum|disk|migrate|health|not-set-up|busy|usage|unknown> <one-line message>
#   DONE <version>
set -euo pipefail

usage() {
  cat <<'EOF'
Teamflow update: install a prebuilt release from GitHub.

Usage:
  sudo teamflow-update [--version X.Y.Z] [--channel stable|prerelease]
                       [--backup-full] [--skip-backup] [--reinstall] [--allow-downgrade]

Options:
  --version X.Y.Z    Install this version (default: the newest on the channel)
  --channel NAME     stable (default) or prerelease
  --backup-full      Also back up uploaded files first (slow with many files)
  --skip-backup      Skip the database backup (not recommended; disables database rollback)
  --reinstall        Reinstall even if this version is already running
  --allow-downgrade  Allow installing an older version (the database is not downgraded)
EOF
}

main() {
  APP_DIR="${APP_DIR:-/opt/teamflow}"
  APP_USER="${APP_USER:-teamflow}"
  SERVICE="teamflow"
  local repo="mrcool5556/teamflow"
  local release_base="https://github.com/${repo}/releases/download"
  local api_base="https://api.github.com/repos/${repo}"
  SYSTEMCTL="systemctl"
  # Overrides for tests and mirrors. Ignored when the app user runs this through sudo, so the
  # web app can never point root at another download source or command.
  if [[ "${SUDO_USER:-}" != "$APP_USER" ]]; then
    release_base="${TEAMFLOW_RELEASE_BASE:-$release_base}"
    api_base="${TEAMFLOW_API_BASE:-$api_base}"
    SYSTEMCTL="${TEAMFLOW_SYSTEMCTL:-systemctl}"
  fi

  local version="" channel="stable" backup_full=false skip_backup=false reinstall=false
  local allow_downgrade=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version) version="${2:-}"; shift 2 ;;
      --channel) channel="${2:-}"; shift 2 ;;
      --backup-full) backup_full=true; shift ;;
      --skip-backup) skip_backup=true; shift ;;
      --reinstall) reinstall=true; shift ;;
      --allow-downgrade) allow_downgrade=true; shift ;;
      --branch)
        echo "FAIL usage --branch is gone: servers now install prebuilt releases, not git branches."
        exit 2
        ;;
      -h|--help) usage; exit 0 ;;
      *) echo "FAIL usage Unknown option: $1"; usage; exit 2 ;;
    esac
  done
  version="${version#v}"
  if [[ -n "$version" && ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    echo "FAIL usage Not a version number: $version"
    exit 2
  fi
  if [[ "$channel" != "stable" && "$channel" != "prerelease" ]]; then
    echo "FAIL usage --channel must be stable or prerelease"
    exit 2
  fi

  if [[ $EUID -ne 0 ]]; then
    echo "Run as root: sudo teamflow-update"
    exit 1
  fi

  # Always append to the log the web page reads; also show it on a terminal.
  local log_file="$APP_DIR/data/maintenance.log"
  mkdir -p "$APP_DIR/data"
  # The server truncates this log when it starts a job, so it must stay the app user's file.
  touch "$log_file"
  chown "$APP_USER:$APP_USER" "$log_file" 2>/dev/null || true
  if [[ -t 1 ]]; then
    exec > >(tee -a "$log_file") 2>&1
  else
    exec >>"$log_file" 2>&1
  fi

  echo ""
  echo "==> Teamflow update $(date -Is)"

  # One update at a time.
  exec 9>"$APP_DIR/data/.update.lock"
  if ! flock -n 9; then
    echo "FAIL busy Another update is already running."
    exit 1
  fi

  if [[ ! -L "$APP_DIR/current" ]]; then
    echo "FAIL not-set-up This server runs from a git checkout, not a release. Run the installer once to switch: curl -fsSL https://github.com/${repo}/releases/latest/download/install.sh | sudo bash"
    exit 1
  fi

  local current_dir current_version
  current_dir="$(readlink -f "$APP_DIR/current")"
  current_version="$(json_field version <"$current_dir/version.json" 2>/dev/null || echo unknown)"
  echo "    Installed: v$current_version ($current_dir)"

  # ---- download -----------------------------------------------------------------------------
  echo "STEP download"
  if [[ -z "$version" ]]; then
    version="$(latest_version "$api_base" "$channel")" || {
      echo "FAIL network Couldn't reach GitHub to look for a new version. Check the server's internet connection, then try again."
      exit 1
    }
  fi
  echo "    Target: v$version"

  if [[ "$version" == "$current_version" && "$reinstall" != true ]]; then
    echo "==> Already on v$version. Nothing to do."
    echo "DONE $version"
    exit 0
  fi
  if [[ "$current_version" != "unknown" && "$allow_downgrade" != true ]] &&
    [[ "$(printf '%s\n%s\n' "$version" "$current_version" | sort -V | tail -n1)" == "$current_version" ]] &&
    [[ "$version" != "$current_version" ]]; then
    echo "FAIL usage v$version is older than the installed v$current_version. Use --allow-downgrade to install it anyway."
    exit 1
  fi

  local free_mb
  free_mb=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
  if [[ "${free_mb:-0}" -lt 300 ]]; then
    echo "FAIL disk Only ${free_mb} MB free on the server; an update needs 300 MB. Empty a space's trash or delete old backups, then try again."
    exit 1
  fi

  local asset="teamflow-v${version}-linux-x64.tar.gz"
  local work="$APP_DIR/releases/.download-v$version"
  rm -rf "$work"
  mkdir -p "$work"
  echo "==> Downloading $asset"
  if ! curl -fsSL --retry 3 --connect-timeout 15 -o "$work/$asset" "$release_base/v$version/$asset" ||
    ! curl -fsSL --retry 3 --connect-timeout 15 -o "$work/SHA256SUMS" "$release_base/v$version/SHA256SUMS"; then
    rm -rf "$work"
    echo "FAIL network Couldn't download v$version from GitHub. Check the server's internet connection, then try again."
    exit 1
  fi
  if ! (cd "$work" && grep -E "  ${asset//./\\.}\$" SHA256SUMS | sha256sum -c --status); then
    rm -rf "$work"
    echo "FAIL checksum The download of v$version didn't match its checksum, so it was not installed. Try again; if it keeps failing, the release may be broken."
    exit 1
  fi
  echo "==> Verified $asset (sha256 ok)"

  local new_dir="$APP_DIR/releases/v$version"
  rm -rf "$new_dir.tmp"
  mkdir -p "$new_dir.tmp"
  tar -xzf "$work/$asset" -C "$new_dir.tmp" --no-same-owner
  rm -rf "$work"
  local unpacked_version
  unpacked_version="$(json_field version <"$new_dir.tmp/version.json" 2>/dev/null || true)"
  if [[ "$unpacked_version" != "$version" ]]; then
    rm -rf "$new_dir.tmp"
    echo "FAIL checksum The download says it is v${unpacked_version:-?}, not v$version. Not installed."
    exit 1
  fi
  chown -R root:root "$new_dir.tmp"
  chmod -R go-w "$new_dir.tmp"
  if [[ "$new_dir" != "$current_dir" ]]; then rm -rf "$new_dir"; fi
  if [[ -d "$new_dir" ]]; then
    # --reinstall of the running version: swap the folder contents in place.
    rm -rf "$new_dir.old"
    mv "$new_dir" "$new_dir.old"
  fi
  mv "$new_dir.tmp" "$new_dir"
  rm -rf "$new_dir.old"

  # ---- backup -------------------------------------------------------------------------------
  echo "STEP backup"
  local backup_script="$current_dir/deploy/proxmox-lxc/backup.sh"
  if [[ "$backup_full" == true ]]; then
    echo "==> Backing up uploaded files (the server keeps running)…"
    bash "$backup_script" --uploads-only
  fi

  # From here on a failure rolls back.
  MIGRATED=false SWITCHED=false
  PREV_DIR="$current_dir" PREV_VERSION="$current_version" DB_BACKUP="" NEW_DIR="$new_dir"
  trap 'rollback $?' EXIT

  echo "==> Stopping teamflow…"
  svc stop "$SERVICE"

  if [[ "$skip_backup" != true ]]; then
    local out
    out="$(bash "$backup_script" --db-only)"
    printf '%s\n' "$out"
    DB_BACKUP="$(printf '%s\n' "$out" | sed -n 's/^BACKUP database //p' | tail -n1)"
    if [[ -z "$DB_BACKUP" ]]; then
      echo "FAIL unknown The database backup did not finish, so nothing was changed."
      exit 1
    fi
  else
    echo "==> Database backup skipped (--skip-backup)."
  fi

  # ---- install ------------------------------------------------------------------------------
  echo "STEP install"
  echo "==> Database migrations…"
  MIGRATED=true
  if ! (cd "$APP_DIR" && runuser -u "$APP_USER" -- node "$new_dir/apps/server/dist/migrate.js"); then
    echo "FAIL migrate The database update for v$version failed. The backup was restored and v$PREV_VERSION is running again."
    exit 1
  fi

  echo "==> Switching current → v$version"
  ln -sfn "releases/v$version" "$APP_DIR/current.tmp"
  mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
  SWITCHED=true
  ensure_links

  local unit_src="$new_dir/deploy/proxmox-lxc/teamflow.service"
  if [[ -f "$unit_src" ]] && ! cmp -s "$unit_src" "/etc/systemd/system/$SERVICE.service"; then
    echo "==> Updating the teamflow service unit"
    sed "s|/opt/teamflow|${APP_DIR}|g" "$unit_src" >"/etc/systemd/system/$SERVICE.service"
    svc daemon-reload
  fi

  # ---- restart ------------------------------------------------------------------------------
  echo "STEP restart"
  svc start "$SERVICE"

  # ---- check --------------------------------------------------------------------------------
  echo "STEP check"
  if ! wait_for_version "$version" 60; then
    echo "FAIL health v$version did not start within 60 seconds, so v$PREV_VERSION was put back. See journalctl -u teamflow -n 50."
    exit 1
  fi
  trap - EXIT
  echo "==> Health ok (v$version)"

  # The new release's maintenance scripts and sudoers rule (root-owned copies).
  APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$new_dir/deploy/proxmox-lxc/setup-maintenance-sudo.sh" >/dev/null ||
    echo "Warning: refreshing the maintenance scripts failed; run: sudo bash $APP_DIR/deploy/proxmox-lxc/setup-maintenance-sudo.sh"

  prune_releases "$version" "$PREV_VERSION"
  echo "DONE $version"
}

# systemctl without the update lock's file descriptor, so nothing it starts can hold the lock.
svc() {
  "$SYSTEMCTL" "$@" 9>&-
}

# Read one top-level string field from JSON on stdin (node is always installed).
json_field() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s)[process.argv[1]];if(typeof v!=="string")process.exit(1);console.log(v)})' "$1"
}

latest_version() {
  local api_base=$1 channel=$2
  if [[ "$channel" == "stable" ]]; then
    curl -fsSL --retry 2 --connect-timeout 15 -H "Accept: application/vnd.github+json" "$api_base/releases/latest" |
      json_field tag_name | sed 's/^v//'
  else
    curl -fsSL --retry 2 --connect-timeout 15 -H "Accept: application/vnd.github+json" "$api_base/releases?per_page=20" |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>!x.draft);if(!r)process.exit(1);console.log(r.tag_name.replace(/^v/,""))})'
  fi
}

port_from_env() {
  local port
  port=$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '"'"'"' ')
  echo "${port:-3000}"
}

wait_for_version() {
  local want=$1 seconds=$2 url body
  url="http://127.0.0.1:$(port_from_env)/health"
  for _ in $(seq 1 "$seconds"); do
    body=$(curl -fsS --max-time 2 "$url" 2>/dev/null || true)
    if [[ "$body" == *"\"version\":\"$want\""* ]]; then return 0; fi
    sleep 1
  done
  return 1
}

# apps/ and deploy/ point into current/, so unit files and scripts keep their old paths.
ensure_links() {
  local name
  for name in apps deploy; do
    if [[ -L "$APP_DIR/$name" || ! -e "$APP_DIR/$name" ]]; then
      ln -sfn "current/$name" "$APP_DIR/$name.tmp"
      mv -T "$APP_DIR/$name.tmp" "$APP_DIR/$name"
    fi
  done
}

# Keep the running release and the one before it (for a manual rollback); delete the rest.
prune_releases() {
  local keep_a="v$1" keep_b="v$2" dir name
  for dir in "$APP_DIR"/releases/v*; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    if [[ "$name" != "$keep_a" && "$name" != "$keep_b" ]]; then
      rm -rf "$dir"
      echo "    removed old release $name"
    fi
  done
}

db_path() {
  local url
  url=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')
  url="${url#file:}"
  url="${url:-./data/teamflow.db}"
  if [[ "$url" != /* ]]; then url="$APP_DIR/${url#./}"; fi
  echo "$url"
}

rollback() {
  local code=$1
  trap - EXIT
  if [[ "$code" -eq 0 ]]; then return; fi
  echo "==> Rolling back to v$PREV_VERSION…"
  svc stop "$SERVICE" 2>/dev/null || true
  if [[ "$SWITCHED" == true ]]; then
    ln -sfn "${PREV_DIR#"$APP_DIR"/}" "$APP_DIR/current.tmp"
    mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
    echo "    current → $PREV_DIR"
  fi
  if [[ "$MIGRATED" == true && -n "$DB_BACKUP" && -f "$DB_BACKUP" ]]; then
    local db
    db="$(db_path)"
    cp "$DB_BACKUP" "$db.restore"
    rm -f "$db-wal" "$db-shm"
    mv -f "$db.restore" "$db"
    chown "$APP_USER:$APP_USER" "$db"
    echo "    database restored from $DB_BACKUP"
  elif [[ "$MIGRATED" == true ]]; then
    echo "    WARNING: no database backup to restore (--skip-backup); the database may be half-migrated."
  fi
  if [[ "$NEW_DIR" != "$PREV_DIR" ]]; then rm -rf "$NEW_DIR"; fi
  if svc start "$SERVICE" && wait_for_version "$PREV_VERSION" 60; then
    echo "==> Rolled back: v$PREV_VERSION is running."
  else
    echo "==> Rollback could not confirm v$PREV_VERSION is running. Check: systemctl status teamflow"
  fi
  exit "$code"
}

main "$@"
