#!/usr/bin/env bash
# Teamflow on Proxmox VE: create a Debian 12 container and install Teamflow in it.
# Run on the Proxmox host as root:
#
#   bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)"
#
# It asks for the container settings (Enter keeps each default), downloads the Debian 12
# template if needed, creates an unprivileged container with nesting (needed for systemd),
# starts it, runs the Linux installer inside and prints the address and setup link.
#
# Options (also environment variables, e.g. TEAMFLOW_CTID=120):
#   --yes                 use the defaults without asking
#   --dry-run             check the host and print the commands; change nothing
#   --ctid N              container ID (default: the next free one)
#   --hostname NAME       default teamflow
#   --storage NAME        disk storage (default: the first that holds containers)
#   --disk GB             default 8
#   --memory MB           default 1024
#   --cores N             default 2
#   --bridge NAME         default vmbr0
#   --ip dhcp|CIDR        default dhcp; with a CIDR also pass --gateway
#   --gateway IP
#   --version X.Y.Z       Teamflow version (default: newest)
#   --port N              default 3000
#   --reuse               the ID belongs to an existing Teamflow container: re-run the
#                         installer inside it instead of creating one (never the default)
#
# Everything sits in main(), called on the last line, so a half-downloaded script runs nothing.
set -euo pipefail

REPO="mrcool5556/teamflow"

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nStopped: %s\n' "$*" >&2
  exit 1
}

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '    [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# ask VAR "Question" — keeps the current value on Enter, --yes or no terminal.
ask() {
  local var=$1 question=$2 answer
  if [[ "$ASSUME_YES" == 1 || "$DRY_RUN" == 1 || ! -r /dev/tty ]]; then return; fi
  read -r -p "$question [${!var}]: " answer </dev/tty || answer=""
  if [[ -n "$answer" ]]; then printf -v "$var" '%s' "$answer"; fi
}

confirm() {
  local answer
  if [[ "$ASSUME_YES" == 1 || "$DRY_RUN" == 1 ]]; then return 0; fi
  [[ -r /dev/tty ]] || die "no terminal to confirm on. Re-run with --yes."
  read -r -p "$1 [Y/n] " answer </dev/tty || answer=""
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

check_host() {
  step "Checking the Proxmox host"
  [[ $EUID -eq 0 || "$DRY_RUN" == 1 ]] || die "run as root on the Proxmox host."
  local tool
  for tool in pct pveam pvesh pvesm pveversion; do
    command -v "$tool" >/dev/null || die "$tool not found. Run this on a Proxmox VE host (or use install.sh inside a Debian machine)."
  done
  [[ "$(uname -m)" == "x86_64" ]] || die "Teamflow releases are x64 only."
  say "    $(pveversion | head -n1)"
}

defaults() {
  CTID="${CTID:-$(pvesh get /cluster/nextid)}"
  HOSTNAME_="${HOSTNAME_:-teamflow}"
  if [[ -z "${STORAGE:-}" ]]; then
    STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
    STORAGE="${STORAGE:-local-lvm}"
  fi
  DISK="${DISK:-8}"
  MEMORY="${MEMORY:-1024}"
  CORES="${CORES:-2}"
  BRIDGE="${BRIDGE:-vmbr0}"
  IP="${IP:-dhcp}"
  GATEWAY="${GATEWAY:-}"
  TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
}

prompt_settings() {
  step "Container settings (Enter keeps the default)"
  ask CTID "Container ID"
  ask HOSTNAME_ "Hostname"
  ask STORAGE "Disk storage"
  ask DISK "Disk size in GB"
  ask MEMORY "Memory in MB"
  ask CORES "CPU cores"
  ask BRIDGE "Network bridge"
  ask IP "IP address (dhcp or CIDR like 192.168.1.50/24)"
  if [[ "$IP" != "dhcp" ]]; then ask GATEWAY "Gateway"; fi

  [[ "$CTID" =~ ^[0-9]+$ ]] || die "container ID must be a number."
  [[ "$DISK" =~ ^[0-9]+$ && "$DISK" -ge 4 ]] || die "disk must be at least 4 GB."
  [[ "$MEMORY" =~ ^[0-9]+$ && "$MEMORY" -ge 512 ]] || die "memory must be at least 512 MB."
  [[ "$CORES" =~ ^[0-9]+$ ]] || die "cores must be a number."
  [[ "$HOSTNAME_" =~ ^[a-zA-Z0-9-]+$ ]] || die "hostname may only use letters, digits and dashes."
  if [[ "$IP" != "dhcp" ]]; then
    [[ "$IP" =~ ^[0-9.]+/[0-9]+$ ]] || die "IP must be dhcp or a CIDR such as 192.168.1.50/24."
    [[ -n "$GATEWAY" ]] || die "a static IP needs --gateway."
  fi

  say ""
  say "    ID $CTID · $HOSTNAME_ · $STORAGE ${DISK} GB · ${MEMORY} MB · $CORES cores · $BRIDGE · $IP"
}

existing_ct() {
  pct status "$CTID" >/dev/null 2>&1
}

pick_template() {
  step "Debian 12 template"
  run pveam update >/dev/null || true
  TEMPLATE=$(pveam available --section system 2>/dev/null | awk '{print $2}' |
    grep -E '^debian-12-standard_.*_amd64\.tar\.(zst|gz|xz)$' | sort -V | tail -n1 || true)
  [[ -n "$TEMPLATE" ]] || die "no debian-12-standard template is listed by pveam available."
  if pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
    say "    $TEMPLATE (already downloaded)"
  else
    say "    downloading $TEMPLATE to $TEMPLATE_STORAGE…"
    run pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  fi
}

create_ct() {
  step "Creating container $CTID"
  local net="name=eth0,bridge=$BRIDGE,ip=$IP"
  if [[ "$IP" != "dhcp" ]]; then net="$net,gw=$GATEWAY"; fi
  run pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
    --hostname "$HOSTNAME_" \
    --cores "$CORES" \
    --memory "$MEMORY" \
    --swap 512 \
    --rootfs "$STORAGE:$DISK" \
    --net0 "$net" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --ostype debian \
    --description "Teamflow (created by proxmox.sh)"
  run pct start "$CTID"
}

wait_network() {
  step "Waiting for the container's network"
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] wait until github.com resolves inside $CTID"
    return
  fi
  for _ in $(seq 1 60); do
    if pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1; then
      say "    online"
      return
    fi
    sleep 2
  done
  die "container $CTID has no internet after 2 minutes. Check the bridge and DHCP, then re-run with --reuse --ctid $CTID."
}

run_installer() {
  step "Installing Teamflow inside container $CTID"
  local url="${TEAMFLOW_INSTALL_URL:-https://github.com/$REPO/releases/latest/download/install.sh}"
  if [[ -n "$VERSION" ]]; then
    url="${TEAMFLOW_INSTALL_URL:-https://github.com/$REPO/releases/download/v$VERSION/install.sh}"
  fi
  local env="TEAMFLOW_YES=1 TEAMFLOW_PORT=$PORT${VERSION:+ TEAMFLOW_VERSION=$VERSION}"
  local inner="set -e; export DEBIAN_FRONTEND=noninteractive; command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null; }; curl -fsSL '$url' | $env bash"
  if [[ "$DRY_RUN" == 1 ]]; then
    say "    [dry-run] pct exec $CTID -- bash -c \"$inner\""
    return
  fi
  pct exec "$CTID" -- bash -c "$inner"
}

main() {
  DRY_RUN="${TEAMFLOW_DRY_RUN:-0}"
  ASSUME_YES="${TEAMFLOW_YES:-0}"
  CTID="${TEAMFLOW_CTID:-}"
  HOSTNAME_="${TEAMFLOW_HOSTNAME:-}"
  STORAGE="${TEAMFLOW_STORAGE:-}"
  DISK="${TEAMFLOW_DISK:-}"
  MEMORY="${TEAMFLOW_MEMORY:-}"
  CORES="${TEAMFLOW_CORES:-}"
  BRIDGE="${TEAMFLOW_BRIDGE:-}"
  IP="${TEAMFLOW_IP:-}"
  GATEWAY="${TEAMFLOW_GATEWAY:-}"
  VERSION="${TEAMFLOW_VERSION:-}"
  PORT="${TEAMFLOW_PORT:-3000}"
  local reuse=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y) ASSUME_YES=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      --ctid) CTID="${2:-}"; shift 2 ;;
      --hostname) HOSTNAME_="${2:-}"; shift 2 ;;
      --storage) STORAGE="${2:-}"; shift 2 ;;
      --disk) DISK="${2:-}"; shift 2 ;;
      --memory) MEMORY="${2:-}"; shift 2 ;;
      --cores) CORES="${2:-}"; shift 2 ;;
      --bridge) BRIDGE="${2:-}"; shift 2 ;;
      --ip) IP="${2:-}"; shift 2 ;;
      --gateway) GATEWAY="${2:-}"; shift 2 ;;
      --version) VERSION="${2:-}"; VERSION="${VERSION#v}"; shift 2 ;;
      --port) PORT="${2:-}"; shift 2 ;;
      --reuse) reuse=1; shift ;;
      -h|--help) sed -n '2,29p' "$0" 2>/dev/null || true; exit 0 ;;
      *) die "unknown option $1 (try --help)" ;;
    esac
  done
  [[ -z "$VERSION" || "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || die "not a version: $VERSION"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "not a port: $PORT"

  if [[ "$DRY_RUN" == 1 ]]; then say "Teamflow for Proxmox (dry run: nothing will be changed)"; else say "Teamflow for Proxmox"; fi
  check_host
  defaults
  prompt_settings

  if existing_ct; then
    if [[ "$reuse" != 1 ]]; then
      die "container $CTID already exists. Pick another ID, or pass --reuse --ctid $CTID to re-run the installer inside it (it keeps its data)."
    fi
    say "    container $CTID exists; re-running the installer inside it (--reuse)"
    confirm "Re-run the Teamflow installer inside existing container $CTID?" || die "nothing was changed."
    if [[ "$(pct status "$CTID" | awk '{print $2}')" != "running" ]]; then run pct start "$CTID"; fi
  else
    [[ "$reuse" != 1 ]] || die "--reuse given but container $CTID does not exist."
    confirm "Create container $CTID and install Teamflow in it?" || die "nothing was changed."
    pick_template
    create_ct
  fi
  wait_network
  run_installer

  if [[ "$DRY_RUN" == 1 ]]; then
    step "Dry run finished: nothing was changed"
    return
  fi
  local ip
  ip=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
  say ""
  say "Container $CTID ($HOSTNAME_) runs Teamflow at http://${ip:-<container-ip>}:$PORT"
  say "Shell into it with: pct enter $CTID"
}

main "$@"
