#!/usr/bin/env bash
# Logic test for deploy/install/proxmox.sh with stub pct/pveam/pvesh/pvesm/pveversion that log
# their arguments and fake success. No Proxmox host is involved, so this checks the argument flow,
# prompts, defaults and error handling, not a real container. Run as root in any Debian container:
#
#   git ls-files -co --exclude-standard | tar -cf - -T - |
#     docker run --rm -i node:20-bookworm bash -c 'mkdir /src && tar -x -C /src && bash /src/deploy/tests/proxmox-stub-test.sh'
set -euo pipefail

SRC="${SRC:-/src}"
PX="$SRC/deploy/install/proxmox.sh"
STUB=/tmp/pve
LOG=/tmp/pve.log
PASS=0
FAILS=()

ok() { PASS=$((PASS + 1)); echo "  ok   $*"; }
bad() { FAILS+=("$*"); echo "  FAIL $*"; }
check() { local what=$1; shift; if "$@"; then ok "$what"; else bad "$what"; fi; }
section() { echo ""; echo "## $*"; }
logged() { grep -qE -- "$1" "$LOG"; }
not_logged() { ! grep -qE -- "$1" "$LOG"; }
out_has() { grep -qF -- "$1" /tmp/out; }

# ---- stubs --------------------------------------------------------------------------------------
mkdir -p "$STUB/bin"
# Existing containers: "<id> <running|stopped>" lines in $STUB/existing.
cat >"$STUB/bin/pct" <<'EOF'
#!/usr/bin/env bash
echo "pct $*" >>/tmp/pve.log
case "$1" in
  status)
    line=$(grep -E "^$2 " /tmp/pve/existing 2>/dev/null || true)
    [[ -n "$line" ]] || { echo "Configuration file 'nodes/pve/lxc/$2.conf' does not exist" >&2; exit 2; }
    echo "status: ${line#* }"
    ;;
  exec)
    shift 3
    case "$*" in
      *getent*) [[ -f /tmp/pve/offline ]] && exit 2; exit 0 ;;
      *"hostname -I"*) echo "10.0.0.5 fd00::5" ;;
      bash\ -c\ *) printf '%s\n' "$3" >/tmp/pve/inner ;;
    esac
    ;;
esac
exit 0
EOF
cat >"$STUB/bin/pveam" <<'EOF'
#!/usr/bin/env bash
echo "pveam $*" >>/tmp/pve.log
case "$1" in
  available)
    [[ -f /tmp/pve/no-template ]] && exit 0
    printf 'system          debian-11-standard_11.7-1_amd64.tar.zst\nsystem          debian-12-standard_12.2-1_amd64.tar.zst\nsystem          debian-12-standard_12.12-1_amd64.tar.zst\nsystem          debian-12-standard_12.7-1_amd64.tar.zst\nsystem          ubuntu-24.04-standard_24.04-2_amd64.tar.zst\n'
    ;;
  list) [[ -f /tmp/pve/have-template ]] && echo "local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst  tzst  130MB" ;;
esac
exit 0
EOF
printf '#!/usr/bin/env bash\necho "pvesh $*" >>/tmp/pve.log\necho 120\n' >"$STUB/bin/pvesh"
# "local" (dir) holds templates only here, so `-content rootdir` leaves it out, as on a stock host.
cat >"$STUB/bin/pvesm" <<'EOF'
#!/usr/bin/env bash
echo "Name Type Status Total Used Available %"
[[ "$*" == *"-content rootdir"* ]] || echo "local dir active 100 1 99 1%"
echo "local-zfs zfspool active 100 1 99 1%"
EOF
printf '#!/usr/bin/env bash\necho "pve-manager/8.3.0/xxxx (running kernel: 6.8)"\n' >"$STUB/bin/pveversion"
printf '#!/usr/bin/env bash\nexit 0\n' >"$STUB/bin/sleep" # the network wait loop runs instantly
chmod +x "$STUB/bin/"*

reset() { : >"$LOG"; rm -f "$STUB/existing" "$STUB/inner" "$STUB/offline" "$STUB/no-template" "$STUB/have-template"; }
# px [args...]: run proxmox.sh as the curl one-liner does (bash -c, no script file), no terminal.
px() { PATH="$STUB/bin:$PATH" bash -c "$(cat "$PX")" _ "$@" </dev/null >/tmp/out 2>&1; }
# px_tty "answers" [args...]: same, with the answers typed into a terminal.
px_tty() {
  local answers=$1; shift
  printf '%b' "$answers" | PATH="$STUB/bin:$PATH" script -qec "bash -c \"\$(cat $PX)\" _ $*" /dev/null >/tmp/out 2>&1
}
DEFAULT_CREATE='^pct create 120 local:vztmpl/debian-12-standard_12\.12-1_amd64\.tar\.zst --hostname teamflow --cores 2 --memory 1024 --swap 512 --rootfs local-zfs:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1 --features nesting=1 --onboot 1 --ostype debian '
ONE_LINER_URL='https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh'

section "Help and argument errors (run as bash -c, the documented way)"
reset; px --help && ok "--help exits 0" || bad "--help exit"
check "--help prints the options" out_has "--reuse"
reset; px --bogus && bad "unknown option accepted" || ok "unknown option refused"
reset; px --version banana && bad "bad version accepted" || ok "bad version refused"
reset; px --port 80x && bad "bad port accepted" || ok "bad port refused"

section "Not a Proxmox host / not root"
reset; bash -c "$(cat "$PX")" _ --yes </dev/null >/tmp/out 2>&1 && bad "ran without pct" || ok "refused without Proxmox tools"
check "says pct not found" out_has "pct not found"
reset; PATH="$STUB/bin:$PATH" runuser -u nobody -- bash -c "$(cat "$PX")" _ --yes </dev/null >/tmp/out 2>&1 && bad "ran as non-root" || ok "refused as non-root"
check "says run as root" out_has "run as root"

section "Defaults with --yes"
reset; px --yes && ok "exit 0" || { cat /tmp/out; bad "exit"; }
check "next free ID from pvesh" logged '^pvesh get /cluster/nextid'
check "newest Debian 12 template (12.12 sorts after 12.7)" logged '^pveam download local debian-12-standard_12\.12-1_amd64\.tar\.zst'
check "pct create with every default, unprivileged, nesting, onboot" logged "$DEFAULT_CREATE"
check "storage is the first active one that holds containers" logged '--rootfs local-zfs:8'
check "starts it" logged '^pct start 120$'
check "waits for the network" logged '^pct exec 120 -- getent hosts github.com'
check "installer is the Linux one-liner, unattended" test "$(cat "$STUB/inner" 2>/dev/null)" = "set -e; export DEBIAN_FRONTEND=noninteractive; command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null; }; curl -fsSL '$ONE_LINER_URL' | TEAMFLOW_YES=1 TEAMFLOW_PORT=3000 bash"
check "prints the address" out_has "Container 120 (teamflow) runs Teamflow at http://10.0.0.5:3000"
check "order: create, start, network, install" bash -c "grep -nE '^pct (create|start|exec)' $LOG | cut -d: -f1 | paste -sd' ' | grep -qE '^[0-9]+ [0-9]+ [0-9]+ [0-9]+'"

section "Options and environment variables"
reset; px --yes --ctid 150 --hostname board --storage tank --disk 20 --cores 4 --memory 2048 --bridge vmbr1 --ip 192.168.1.50/24 --gateway 192.168.1.1 --version 0.2.1 --port 8080 || { cat /tmp/out; bad "exit"; }
check "every option reaches pct create" logged '^pct create 150 .* --hostname board --cores 4 --memory 2048 --swap 512 --rootfs tank:20 --net0 name=eth0,bridge=vmbr1,ip=192.168.1.50/24,gw=192.168.1.1 '
check "no pvesh call when --ctid is given" not_logged '^pvesh'
check "--version pins the installer and the release" grep -qF "curl -fsSL 'https://github.com/mrcool5556/teamflow/releases/download/v0.2.1/install.sh' | TEAMFLOW_YES=1 TEAMFLOW_PORT=8080 TEAMFLOW_VERSION=0.2.1 bash" "$STUB/inner"
check "address uses --port" out_has "http://10.0.0.5:8080"
reset; TEAMFLOW_MEMORY=4096 TEAMFLOW_HOSTNAME=env-host px --yes || bad "env exit"
check "environment variables work" logged '^pct create 120 .* --hostname env-host --cores 2 --memory 4096 '
reset; touch "$STUB/have-template"; px --yes || bad "exit"
check "template already there: no download" not_logged '^pveam download'
check "...still creates from it" logged '^pct create 120 local:vztmpl/debian-12-standard_12\.12-1'

section "Prompts (through a terminal)"
reset; px_tty '\n\n\n\n\n\n\n\n\n' && ok "Enter everywhere: exit 0" || { cat /tmp/out; bad "Enter everywhere exit"; }
check "Enter keeps every default" logged "$DEFAULT_CREATE"
check "shows defaults in brackets" out_has "Container ID [120]:"
reset; px_tty '130\ntf2\n\n12\n2048\n3\n\n10.0.0.9/24\n10.0.0.1\ny\n' || { cat /tmp/out; bad "answers exit"; }
check "answers reach pct create" logged '^pct create 130 .* --hostname tf2 --cores 3 --memory 2048 --swap 512 --rootfs local-zfs:12 --net0 name=eth0,bridge=vmbr0,ip=10.0.0.9/24,gw=10.0.0.1 '
check "asks for the gateway only with a static IP" out_has "Gateway []:"
reset; px_tty '\n\n\n\n\n\n\n\nn\n' && bad "'n' should stop" || ok "'n' at the confirm stops"
check "...with nothing created" not_logged '^pct (create|start)|^pveam download'
check "...and says so" out_has "nothing was changed"
# Every run answers every prompt (8, or 9 with a static IP): a pty never sends EOF to a waiting read.
reset; px_tty '\n\n\n\nlots\n\n\n\n' && bad "memory 'lots' accepted" || ok "memory must be a number"
check "...says why" out_has "memory must be at least 512 MB"
reset; px_tty '\n\n\n2\n\n\n\n\n' && bad "disk 2 accepted" || ok "disk under 4 GB refused"
reset; px_tty '\nmy_host\n\n\n\n\n\n\n' && bad "bad hostname accepted" || ok "hostname with _ refused"
reset; px_tty '\n\n\n\n\n\n\n10.0.0.9\n10.0.0.1\n' && bad "IP without /prefix accepted" || ok "IP must be a CIDR"
check "nothing created by any refused answer" not_logged '^pct create'

section "No terminal and no --yes"
reset; setsid bash -c "$(declare -f px); STUB=$STUB PX=$PX px" && bad "should not run unattended without --yes" || ok "stops without a terminal"
check "...says to use --yes" out_has "Re-run with --yes"
check "...after creating nothing" not_logged '^pct create'

section "Existing containers"
reset; echo "120 running" >"$STUB/existing"; px --yes && bad "existing CT accepted" || ok "existing ID refused without --reuse"
check "...points at --reuse" out_has "--reuse --ctid 120"
check "...and touched nothing" not_logged '^pct (create|start|exec|set|stop|destroy)'
reset; echo "120 stopped" >"$STUB/existing"; px --yes --reuse --ctid 120 || { cat /tmp/out; bad "reuse exit"; }
check "--reuse starts a stopped CT" logged '^pct start 120$'
check "--reuse never creates" not_logged '^pct create|^pveam download'
check "--reuse runs the same installer" grep -qF "| TEAMFLOW_YES=1 TEAMFLOW_PORT=3000 bash" "$STUB/inner"
reset; echo "120 running" >"$STUB/existing"; px --yes --reuse --ctid 120 || bad "reuse running exit"
check "--reuse leaves a running CT running" not_logged '^pct start'
reset; px --yes --reuse --ctid 777 && bad "--reuse on a missing CT accepted" || ok "--reuse on a missing CT refused"

section "Failures on the way"
reset; touch "$STUB/no-template"; px --yes && bad "no template accepted" || ok "no Debian 12 template: stops"
check "...before creating anything" not_logged '^pct create'
reset; touch "$STUB/offline"; px --yes && bad "offline accepted" || ok "no network in the CT: stops"
check "...says how to retry" out_has "re-run with --reuse --ctid 120"
check "...without running the installer" test ! -e "$STUB/inner"

section "Dry run"
reset; px --dry-run && ok "exit 0" || { cat /tmp/out; bad "dry run exit"; }
check "prints pct create" grep -qE '\[dry-run\] pct create 120 .*--unprivileged 1 --features nesting=1 --onboot 1' /tmp/out
check "prints the installer command" out_has "$ONE_LINER_URL"
check "changes nothing" not_logged '^pct (create|start|exec)|^pveam (download|update)'
reset; runuser -u nobody -- env PATH="$STUB/bin:$PATH" bash -c "$(cat "$PX")" _ --dry-run </dev/null >/tmp/out 2>&1 && ok "dry run works as non-root" || bad "dry run as non-root"

echo ""
echo "passed: $PASS   failed: ${#FAILS[@]}"
for f in "${FAILS[@]}"; do echo "  - $f"; done
[[ ${#FAILS[@]} -eq 0 ]]
