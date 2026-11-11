#!/usr/bin/env bash
# Teamflow installer for Debian 12+ / Ubuntu 22.04+ (x64), also used inside Proxmox containers.
#
#   curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash
#
# Installs Node 20 if needed, downloads and verifies the newest release, generates secrets,
# sets up the systemd service and the in-app update permission, checks that Teamflow answers and
# prints the address (with the one-time setup link on a new server).
#
# Safe to re-run: it keeps .env, the database and uploads, and only adds what is missing. On a
# server that still runs from a git checkout it offers to switch to prebuilt releases.
#
# Options (also as environment variables for `curl | bash`):
#   --yes            no questions (TEAMFLOW_YES=1)
#   --version X.Y.Z  install this version instead of the newest (TEAMFLOW_VERSION)
#   --port N         port for a new install, default 3000 (TEAMFLOW_PORT)
#   --update         on an existing install, also update to the newest version
#   --dry-run        check the machine and print what would be done; change nothing
#
# Everything sits in main(), called on the last line, so a half-downloaded script runs nothing.
set -euo pipefail

REPO="mrcool5556/teamflow"
APP_DIR="/opt/teamflow"
APP_USER="teamflow"
SERVICE="teamflow"

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nTeamflow install stopped: %s\n' "$*" >&2
  exit 1
}

# Mutating commands go through act, so --dry-run can print them instead.
act() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '    [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

ask_yes() {
  local question=$1 answer
  if [[ "$ASSUME_YES" == 1 ]]; then return 0; fi
  if [[ ! -r /dev/tty ]]; then
    die "$question Re-run with --yes (or TEAMFLOW_YES=1) to answer yes without a terminal."
  fi
  read -r -p "$question [Y/n] " answer </dev/tty || answer=""
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

random_hex() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

env_get() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  grep -E "^$1=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

env_set_if_missing() {
  local key=$1 value=$2 current
  current="$(env_get "$key")"
  if [[ -n "$current" ]]; then return 0; fi
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] add $key to .env"
    return 0
  fi
  if grep -qE "^$key=" "$APP_DIR/.env" 2>/dev/null; then
    sed -i "s|^$key=.*|$key=$value|" "$APP_DIR/.env"
  else
    printf '%s=%s\n' "$key" "$value" >>"$APP_DIR/.env"
  fi
  say "    .env: set $key"
}

is_placeholder_secret() {
  local v=$1
  [[ ${#v} -lt 16 || "$v" == change-me* || "$v" == "dev-secret" ]]
}

check_machine() {
  step "Checking this machine"
  if [[ "$DRY_RUN" != 1 && $EUID -ne 0 ]]; then
    die "run as root: curl -fsSL https://github.com/$REPO/releases/latest/download/install.sh | sudo bash"
  fi

  local id="" like=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    id=$(. /etc/os-release && echo "${ID:-}")
    # shellcheck disable=SC1091
    like=$(. /etc/os-release && echo "${ID_LIKE:-}")
  fi
  if [[ "$id" != "debian" && "$id" != "ubuntu" && "$like" != *debian* ]]; then
    die "this installer supports Debian 12+ and Ubuntu 22.04+ (found ${id:-unknown})."
  fi

  local arch
  arch=$(uname -m)
  if [[ "$arch" != "x86_64" ]]; then
    die "Teamflow releases are built for x64 only (this machine is $arch)."
  fi

  local glibc
  glibc=$(ldd --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+$' || echo 0)
  if [[ "$(printf '%s\n%s\n' "2.35" "$glibc" | sort -V | head -n1)" != "2.35" ]]; then
    die "glibc $glibc is too old; Teamflow needs 2.35+ (Debian 12, Ubuntu 22.04 or newer)."
  fi

  if [[ -z "${TEAMFLOW_SYSTEMCTL:-}" && ! -d /run/systemd/system ]]; then
    die "systemd is not running here. In a Proxmox container, create it with nesting=1 (the Proxmox one-liner does)."
  fi

  local free_mb
  mkdir -p /opt 2>/dev/null || true
  free_mb=$(df -Pm /opt | awk 'NR==2 {print $4}')
  if [[ "${free_mb:-0}" -lt 1024 ]]; then
    die "only ${free_mb} MB free under /opt; Teamflow needs at least 1 GB."
  fi
  say "    $id $(. /etc/os-release && echo "${VERSION_ID:-}") · $arch · glibc $glibc · ${free_mb} MB free"
}

install_packages() {
  step "System packages"
  local need=()
  command -v curl >/dev/null || need+=(curl)
  command -v sudo >/dev/null || need+=(sudo)
  [[ -f /etc/ssl/certs/ca-certificates.crt ]] || need+=(ca-certificates)
  command -v flock >/dev/null || need+=(util-linux)
  if [[ ${#need[@]} -gt 0 ]]; then
    act apt-get update -qq
    act env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
  else
    say "    curl, sudo and certificates are present"
  fi

  local major=""
  if command -v node >/dev/null; then major=$(node -v | sed 's/^v//' | cut -d. -f1); fi
  if [[ "$major" == "20" ]]; then
    say "    Node $(node -v) is present"
    return
  fi
  if [[ -n "$major" ]]; then
    ask_yes "Teamflow needs Node 20 and this machine has Node $major. Install Node 20 from NodeSource (replaces it)?" ||
      die "Node 20 is required."
  fi
  say "    installing Node 20 (NodeSource)…"
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
    return
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" == "20" ]] || die "Node 20 did not install (node -v says $(node -v))."
}

ensure_user() {
  if id "$APP_USER" >/dev/null 2>&1; then return; fi
  step "Creating the $APP_USER user"
  act useradd --system --home-dir "$APP_DIR/data" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
}

# An install made from a git checkout (the old way) moves aside; .env and data/ move back in.
convert_git_checkout() {
  [[ -d "$APP_DIR/.git" ]] || return 0
  step "This server runs Teamflow from a git checkout"
  local kept
  kept="$APP_DIR.git-$(date +%Y%m%d-%H%M%S)"
  say "    Prebuilt releases replace it. Your .env, database and uploads are kept; the checkout"
  say "    moves to $kept (delete it later), and the database is backed up first."
  ask_yes "Switch this server to prebuilt releases?" || die "nothing was changed."

  local url db
  url=$(env_get DATABASE_URL)
  url="${url#file:}"
  url="${url:-./data/teamflow.db}"
  if [[ "$url" == /* ]]; then db="$url"; else db="$APP_DIR/${url#./}"; fi
  case "$db" in
    "$APP_DIR"/data/*) ;;
    "$APP_DIR"/*) die "the database is at $db, inside the checkout but not in data/. Move it to $APP_DIR/data and set DATABASE_URL=file:./data/teamflow.db first." ;;
    *) ;;
  esac

  act systemctl_do stop "$SERVICE"
  if [[ -f "$db" ]]; then
    local backup
    backup="/var/backups/teamflow/teamflow_$(date +%Y-%m-%d_%H%M%S)-before-releases.db"
    act mkdir -p /var/backups/teamflow
    act cp "$db" "$backup"
    say "    database backed up to $backup"
  fi
  act mv "$APP_DIR" "$kept"
  act mkdir -p "$APP_DIR"
  [[ -f "$kept/.env" ]] && act mv "$kept/.env" "$APP_DIR/.env"
  [[ -d "$kept/data" ]] && act mv "$kept/data" "$APP_DIR/data"
  say "    checkout kept at $kept"
}

prepare_dirs() {
  step "Folders"
  act mkdir -p "$APP_DIR/releases" "$APP_DIR/data"
  act chown root:root "$APP_DIR" "$APP_DIR/releases"
  act chmod 755 "$APP_DIR" "$APP_DIR/releases"
  act chown "$APP_USER:$APP_USER" "$APP_DIR/data"
  act chmod 750 "$APP_DIR/data"
  say "    $APP_DIR (releases root-owned, data owned by $APP_USER)"
}

write_env() {
  step "Settings (.env)"
  local fresh=0
  if [[ ! -f "$APP_DIR/.env" ]]; then
    fresh=1
    if [[ "$DRY_RUN" == 1 ]]; then
      say "    [dry-run] create $APP_DIR/.env"
    else
      cat >"$APP_DIR/.env" <<EOF
# Teamflow settings. Written by the installer; re-running it only adds missing lines.
# Site name, public address, e-mail and invites are set on the Server admin page instead.
NODE_ENV=production
EOF
    fi
  fi

  env_set_if_missing PORT "$PORT"
  env_set_if_missing HOST "0.0.0.0"
  env_set_if_missing DATABASE_URL "file:./data/teamflow.db"
  env_set_if_missing SERVE_WEB "true"
  env_set_if_missing TEAMFLOW_MAINTENANCE_ENABLED "true"

  local jwt secrets
  jwt="$(env_get JWT_SECRET)"
  secrets="$(env_get TEAMFLOW_SECRETS_KEY)"
  if is_placeholder_secret "$jwt"; then
    if [[ -n "$jwt" && "$DRY_RUN" != 1 ]]; then sed -i '/^JWT_SECRET=/d' "$APP_DIR/.env"; fi
    env_set_if_missing JWT_SECRET "$(random_hex)"
    jwt="$(env_get JWT_SECRET)"
  fi
  if [[ -z "$secrets" ]]; then
    if [[ "$fresh" == 1 ]]; then
      env_set_if_missing TEAMFLOW_SECRETS_KEY "$(random_hex)"
    else
      # Saved integration secrets were encrypted with JWT_SECRET (the fallback); the same value
      # keeps them readable and lets JWT_SECRET change later without losing them.
      env_set_if_missing TEAMFLOW_SECRETS_KEY "$jwt"
    fi
  fi
  act chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  act chmod 600 "$APP_DIR/.env"
}

latest_version() {
  local api="${TEAMFLOW_API_BASE:-https://api.github.com/repos/$REPO}"
  curl -fsSL --retry 2 --connect-timeout 15 -H "Accept: application/vnd.github+json" "$api/releases/latest" |
    grep -oE '"tag_name" *: *"v?[^"]+"' | head -n1 | sed -E 's/.*"v?([^"]+)"$/\1/'
}

install_release() {
  local version=$1
  local dir="$APP_DIR/releases/v$version"
  if [[ -L "$APP_DIR/current" && "$(readlink "$APP_DIR/current")" == "releases/v$version" && -f "$dir/version.json" ]]; then
    say "    v$version is already installed"
    return
  fi
  local base="${TEAMFLOW_RELEASE_BASE:-https://github.com/$REPO/releases/download}"
  local asset="teamflow-v$version-linux-x64.tar.gz"
  step "Downloading Teamflow v$version"
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] download $base/v$version/$asset, check SHA256SUMS, unpack to $dir"
    return
  fi
  local work
  work=$(mktemp -d)
  curl -fsSL --retry 3 --connect-timeout 15 -o "$work/$asset" "$base/v$version/$asset" ||
    die "couldn't download $asset. Check the internet connection and that v$version exists."
  curl -fsSL --retry 3 --connect-timeout 15 -o "$work/SHA256SUMS" "$base/v$version/SHA256SUMS" ||
    die "couldn't download SHA256SUMS for v$version."
  (cd "$work" && grep -E "  ${asset//./\\.}\$" SHA256SUMS | sha256sum -c --status) ||
    die "the download didn't match its checksum; nothing was installed. Try again."
  say "    verified (sha256)"
  rm -rf "$dir.tmp"
  mkdir -p "$dir.tmp"
  tar -xzf "$work/$asset" -C "$dir.tmp" --no-same-owner
  rm -rf "$work"
  chown -R root:root "$dir.tmp"
  chmod -R go-w "$dir.tmp"
  rm -rf "$dir"
  mv "$dir.tmp" "$dir"
  ln -sfn "releases/v$version" "$APP_DIR/current.tmp"
  mv -T "$APP_DIR/current.tmp" "$APP_DIR/current"
  say "    installed to $dir"
}

link_paths() {
  local name
  for name in apps deploy; do
    if [[ -e "$APP_DIR/$name" && ! -L "$APP_DIR/$name" ]]; then
      die "$APP_DIR/$name is a folder, expected a link into current/. Move it away and re-run."
    fi
    act ln -sfn "current/$name" "$APP_DIR/$name"
  done
}

systemctl_do() {
  "${TEAMFLOW_SYSTEMCTL:-systemctl}" "$@"
}

setup_service() {
  step "Service"
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] migrate the database, install teamflow.service, enable and start it"
    say "    [dry-run] install the update permission (setup-maintenance-sudo.sh)"
    return
  fi
  local out
  if ! out=$(cd "$APP_DIR" && runuser -u "$APP_USER" -- node "$APP_DIR/current/apps/server/dist/migrate.js" 2>&1); then
    printf '%s\n' "$out" | tail -n 20
    die "the database migration failed (output above). Nothing else was changed."
  fi
  say "    database ready"
  local unit_src="$APP_DIR/current/deploy/proxmox-lxc/teamflow.service"
  local unit_dst="/etc/systemd/system/$SERVICE.service"
  if ! cmp -s "$unit_src" "$unit_dst"; then
    mkdir -p /etc/systemd/system
    cp "$unit_src" "$unit_dst"
    systemctl_do daemon-reload
  fi
  systemctl_do enable "$SERVICE" >/dev/null 2>&1 || true
  systemctl_do restart "$SERVICE"
  say "    teamflow.service running"

  local sudo_setup="$APP_DIR/current/deploy/proxmox-lxc/setup-maintenance-sudo.sh"
  APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$sudo_setup" >/dev/null ||
    die "couldn't install the update permission (setup-maintenance-sudo.sh). Run it by hand to see why: sudo bash $APP_DIR/deploy/proxmox-lxc/setup-maintenance-sudo.sh"
  install -m 755 "$APP_DIR/current/deploy/proxmox-lxc/configure-smtp.sh" /usr/local/bin/teamflow-smtp
  say "    one-click updates enabled (Settings → Updates)"
}

wait_healthy() {
  local port=$1 body
  for _ in $(seq 1 60); do
    body=$(curl -fsS --max-time 2 "http://127.0.0.1:$port/health" 2>/dev/null || true)
    if [[ "$body" == *'"ok":true'* ]]; then return 0; fi
    sleep 1
  done
  return 1
}

print_address() {
  local port=$1 ip setup code=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  ip="${ip:-localhost}"
  local base="http://$ip:$port"
  setup=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/auth/setup" 2>/dev/null || true)

  say ""
  say "────────────────────────────────────────────────────────────"
  if [[ "$setup" == *'"needed":true'* ]]; then
    for _ in $(seq 1 10); do
      code=$(head -n1 "$APP_DIR/data/setup-code" 2>/dev/null | tr -d '[:space:]' || true)
      [[ -n "$code" ]] && break
      sleep 1
    done
    say " Teamflow is running. Finish setup in your browser:"
    say ""
    say "   $base/setup${code:+?code=$code}"
    [[ -n "$code" ]] && say "   Setup code: $code"
    say ""
    say " The setup page creates the admin account. The code works once."
  elif [[ -z "$setup" ]]; then
    say " Teamflow is running: $base"
    say " Open it and register; the first account becomes the instance admin."
  else
    say " Teamflow is running: $base"
  fi
  say "────────────────────────────────────────────────────────────"
  say " Updates:  Settings → Updates (or: sudo teamflow-update)"
  say " Backups:  sudo teamflow-backup        E-mail: sudo teamflow-smtp"
  say " Status:   systemctl status teamflow   Logs: journalctl -u teamflow -n 50"
}

main() {
  DRY_RUN="${TEAMFLOW_DRY_RUN:-0}"
  ASSUME_YES="${TEAMFLOW_YES:-0}"
  local version="${TEAMFLOW_VERSION:-}" do_update=0
  PORT="${TEAMFLOW_PORT:-3000}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y) ASSUME_YES=1; shift ;;
      --version) version="${2:-}"; shift 2 ;;
      --port) PORT="${2:-}"; shift 2 ;;
      --update) do_update=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
      *) die "unknown option $1 (try --help)" ;;
    esac
  done
  version="${version#v}"
  [[ -z "$version" || "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || die "not a version: $version"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "not a port: $PORT"

  if [[ "$DRY_RUN" == 1 ]]; then say "Teamflow installer (dry run: nothing will be changed)"; else say "Teamflow installer"; fi
  check_machine
  install_packages

  local existing=0
  [[ -L "$APP_DIR/current" ]] && existing=1
  if [[ -z "$version" ]]; then
    if [[ "$existing" == 1 && "$do_update" != 1 ]]; then
      version=$(node -e 'console.log(require(process.argv[1]).version)' "$APP_DIR/current/version.json" 2>/dev/null || true)
    fi
    if [[ -z "$version" ]]; then
      version=$(latest_version) || true
      [[ -n "$version" ]] || die "couldn't find the newest release on GitHub. Check the internet connection, or pass --version."
    fi
  fi
  say "    Teamflow v$version"

  ensure_user
  convert_git_checkout
  prepare_dirs
  write_env
  PORT="$(env_get PORT)"
  PORT="${PORT:-3000}"

  if [[ "$existing" == 1 && "$do_update" == 1 && "$DRY_RUN" != 1 ]]; then
    step "Updating"
    bash "$APP_DIR/current/deploy/proxmox-lxc/update.sh" --version "$version" || true
    tail -n 3 "$APP_DIR/data/maintenance.log" || true
  else
    install_release "$version"
  fi
  link_paths
  setup_service

  if [[ "$DRY_RUN" == 1 ]]; then
    step "Dry run finished: nothing was changed"
    return
  fi
  step "Checking Teamflow answers"
  if ! wait_healthy "$PORT"; then
    die "Teamflow didn't answer on port $PORT within 60 seconds. See: journalctl -u teamflow -n 50"
  fi
  print_address "$PORT"
}

main "$@"
