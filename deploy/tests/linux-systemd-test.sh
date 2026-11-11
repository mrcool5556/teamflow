#!/usr/bin/env bash
# Test-only: the Linux one-liner under a real systemd (PID 1) in a privileged Debian 12 container,
# with real apt and NodeSource. Docker is only the test bench here, never an install method.
#
# Run from the repo root on a machine with Docker (Git Bash on Windows works):
#
#   bash deploy/tests/linux-systemd-test.sh
#
# It builds a linux-x64 release in node:20-bookworm, then serves it as fake github.com and
# api.github.com over HTTPS (a test CA trusted only inside the test container), so the installer,
# update.sh through sudo and the server's release check all run with their real default URLs.
# Checks: one-liner install, service under systemd, setup code and admin, maintenance sudo,
# in-app backup and update, failed updates roll back under systemd, backup and restore, and the
# service coming back after a container restart. Removes its containers, network and image at the end
# (KEEP=1 keeps them for a look around).
set -euo pipefail
export MSYS_NO_PATHCONV=1

NET=tf-systemd-test
GH=tf-fakegh
CT=tf-systemd
IMAGE=teamflow-systemd-test:local
GH_IP=172.29.77.10
HERE=$(pwd)
command -v cygpath >/dev/null && HERE=$(cygpath -m "$HERE")
WORK="$HERE/out/systemd-test"
PASS=0
FAILS=()

ok() { PASS=$((PASS + 1)); echo "  ok   $*"; }
bad() { FAILS+=("$*"); echo "  FAIL $*"; }
check() { local what=$1; shift; if "$@"; then ok "$what"; else bad "$what"; fi; }
section() { echo ""; echo "## $*"; }
has() { [[ "$1" == *"$2"* ]]; }
lacks() { [[ "$1" != *"$2"* ]]; }
in_ct() { docker exec -i "$CT" bash -c "$1"; }

cleanup() {
  if [[ "${KEEP:-0}" == 1 ]]; then echo "KEEP=1: left $CT, $GH, $NET and $IMAGE running"; return; fi
  docker rm -f "$CT" "$GH" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---- build the release and the fake GitHub content (node:20-bookworm) ---------------------------
section "Build linux-x64 releases and the test CA"
rm -rf "$WORK"
mkdir -p "$WORK"
git ls-files -co --exclude-standard | tar -cf - -T - |
  docker run --rm -i -v "$WORK:/work" node:20-bookworm bash -c '
set -euo pipefail
mkdir /src && tar -x -C /src && cd /src
corepack enable >/dev/null 2>&1
pnpm install --frozen-lockfile >/tmp/install.log 2>&1 || { tail -30 /tmp/install.log; exit 1; }
node scripts/package-release.mjs --version 0.2.0 >/tmp/package.log 2>&1 || { tail -30 /tmp/package.log; exit 1; }
BASE=out/teamflow-v0.2.0-linux-x64.tar.gz
REL=/work/releases
mkdir -p "$REL/api"
make_release() {
  local v=$1 mutate=${2:-} dir
  dir=$(mktemp -d)
  tar -xzf "$BASE" -C "$dir"
  node -e "const f=process.argv[1];const j=JSON.parse(require(\"fs\").readFileSync(f));j.version=process.argv[2];require(\"fs\").writeFileSync(f,JSON.stringify(j))" "$dir/version.json" "$v"
  case "$mutate" in
    break-migrate) echo "console.error(\"boom: migration failed\"); process.exit(1);" >"$dir/apps/server/dist/migrate.js" ;;
    break-start) echo "console.error(\"boom: cannot start\"); process.exit(1);" >"$dir/apps/server/dist/index.js" ;;
  esac
  mkdir -p "$REL/download/v$v"
  tar -czf "$REL/download/v$v/teamflow-v$v-linux-x64.tar.gz" -C "$dir" .
  (cd "$REL/download/v$v" && sha256sum "teamflow-v$v-linux-x64.tar.gz" >SHA256SUMS)
  cp deploy/install/install.sh deploy/install/proxmox.sh "$REL/download/v$v/"
  rm -rf "$dir"
}
make_release 0.2.0
make_release 0.2.1
make_release 0.2.2 break-start
make_release 0.2.3 break-migrate
cp deploy/tests/fake-github-tls.mjs /work/
cd /work
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=Teamflow test CA" -keyout ca.key -out ca.crt 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=github.com" -keyout gh.key -out gh.csr 2>/dev/null
printf "subjectAltName=DNS:github.com,DNS:api.github.com\n" >san.ext
openssl x509 -req -in gh.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 2 -extfile san.ext -out gh.crt 2>/dev/null
echo "built $(du -h /src/$BASE | cut -f1)"
'
ok "linux-x64 release built; test releases 0.2.0, 0.2.1, 0.2.2 (won't start), 0.2.3 (migration fails)"

set_latest() {
  printf '{"tag_name":"v%s","draft":false,"prerelease":false}' "$1" >"$WORK/releases/api/latest"
  printf '[{"tag_name":"v%s","draft":false,"prerelease":false,"body":"test","published_at":"2026-11-10T00:00:00Z","assets":[{"name":"teamflow-v%s-linux-x64.tar.gz"}]}]' "$1" "$1" >"$WORK/releases/api/releases"
}
set_latest 0.2.0

# ---- containers ---------------------------------------------------------------------------------
section "Containers"
docker rm -f "$CT" "$GH" >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true
docker network create --subnet 172.29.77.0/24 "$NET" >/dev/null
docker run -d --name "$GH" --network "$NET" --ip "$GH_IP" -v "$WORK:/work" node:20-bookworm \
  node /work/fake-github-tls.mjs /work/releases /work/gh.crt /work/gh.key 443 >/dev/null
docker build -q -t "$IMAGE" - >/dev/null <<'EOF'
FROM debian:12
RUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && systemctl mask getty@.service console-getty.service systemd-logind.service
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
EOF
docker run -d --name "$CT" --hostname teamflow --network "$NET" --privileged --cgroupns=private \
  --tmpfs /run --tmpfs /run/lock \
  --add-host "github.com:$GH_IP" --add-host "api.github.com:$GH_IP" \
  "$IMAGE" >/dev/null
docker cp "$WORK/ca.crt" "$CT:/usr/local/share/ca-certificates/teamflow-test-ca.crt" >/dev/null

wait_systemd() {
  local s=""
  for _ in $(seq 1 60); do
    s=$(docker exec "$CT" systemctl is-system-running 2>/dev/null || true)
    [[ "$s" == running || "$s" == degraded ]] && return 0
    sleep 1
  done
  echo "    systemd state: $s"
  return 1
}
check "systemd is PID 1 and booted" wait_systemd
check "PID 1 is systemd" test "$(docker exec "$CT" cat /proc/1/comm)" = systemd
# Test-only trust: the test CA for curl (system store) and for Node (the server's release check).
in_ct 'update-ca-certificates >/dev/null 2>&1
mkdir -p /etc/systemd/system/teamflow.service.d
printf "[Service]\nEnvironment=NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt\n" >/etc/systemd/system/teamflow.service.d/test-ca.conf'
check "fake github.com answers over trusted TLS" in_ct 'curl -fsS https://api.github.com/repos/mrcool5556/teamflow/releases/latest | grep -q v0.2.0'

health() { in_ct 'curl -fsS --max-time 3 http://127.0.0.1:3000/health 2>/dev/null' || true; }
running_version() { health | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
wait_version() {
  for _ in $(seq 1 "${2:-60}"); do [[ "$(running_version)" == "$1" ]] && return 0; sleep 1; done
  return 1
}
last_line() { in_ct "grep -E '^$1 ' /opt/teamflow/data/maintenance.log | tail -n1"; }
api() { # api METHOD PATH [JSON]
  in_ct "curl -sS -X $1 -H 'Content-Type: application/json' ${TOKEN:+-H 'Authorization: Bearer $TOKEN'} ${3:+--data '$3'} http://127.0.0.1:3000$2"
}

# ---- the one-liner ------------------------------------------------------------------------------
section "One-liner (curl | bash, real apt and NodeSource, real systemd)"
in_ct 'curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | bash' >"$WORK/install.log" 2>&1 &&
  ok "installer exit 0" || { tail -40 "$WORK/install.log"; bad "installer exit"; }
check "Node 20 from NodeSource at /usr/bin/node" in_ct '/usr/bin/node -v | grep -q "^v20\." && apt-cache policy nodejs | grep -q nodesource'
check "sudo was installed" in_ct 'command -v sudo >/dev/null'
check "service is active under systemd" in_ct 'systemctl is-active --quiet teamflow'
check "service is enabled at boot" in_ct 'systemctl is-enabled --quiet teamflow'
check "service runs as teamflow" test "$(in_ct 'stat -c %U "/proc/$(systemctl show -p MainPID --value teamflow)"')" = teamflow
check "KillMode=process" test "$(in_ct 'systemctl show -p KillMode --value teamflow')" = process
check "/health reports 0.2.0" wait_version 0.2.0 30
CODE=$(grep -oE 'setup\?code=[A-Z2-9]{4}-[A-Z2-9]{4}' "$WORK/install.log" | head -n1 | cut -d= -f2 || true)
check "printed the setup link and code" test -n "$CODE"
check "printed code matches data/setup-code" test "$(in_ct 'head -n1 /opt/teamflow/data/setup-code' | tr -d '[:space:]')" = "$CODE"
check "register is closed before setup" lacks "$(api POST /auth/register '{"email":"x@example.test","name":"X","password":"correct-horse-battery"}')" token

section "Create the admin with the setup code"
check "wrong code refused" lacks "$(api POST /auth/setup/admin '{"code":"AAAA-AAAA","email":"a@example.test","name":"Admin","password":"correct-horse-battery"}')" token
reg=$(api POST /auth/setup/admin "{\"code\":\"$CODE\",\"email\":\"admin@example.test\",\"name\":\"Admin\",\"password\":\"correct-horse-battery\"}")
TOKEN=$(printf '%s' "$reg" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
check "admin created, token returned" test -n "$TOKEN"
check "setup code file removed" in_ct '! test -e /opt/teamflow/data/setup-code'
TEAM=$(api POST /teams '{"name":"Test","key":"TST"}' | sed -n 's/.*"team":{"id":"\([^"]*\)".*/\1/p')
check "team created" test -n "$TEAM"

section "Maintenance sudo (as the teamflow user, as the app runs it)"
for s in update backup restore; do
  check "sudo -n $s.sh --help" in_ct "runuser -u teamflow -- sudo -n /usr/local/lib/teamflow/$s.sh --help >/dev/null"
done
check "sudo rule allows discord-bot.sh" in_ct 'runuser -u teamflow -- sudo -n -l /usr/local/lib/teamflow/discord-bot.sh >/dev/null'
check "anything else is refused" in_ct '! runuser -u teamflow -- sudo -n /bin/true 2>/dev/null'

section "In-app backup and update (through sudo, default github.com URLs)"
set_latest 0.2.1
st=$(api POST "/teams/$TEAM/server/maintenance/check")
check "maintenance enabled" has "$st" '"enabled":true'
check "release check sees v0.2.1" has "$st" '"version":"0.2.1"' || echo "    $st" | head -c 800
api POST "/teams/$TEAM/server/maintenance/backup" '{"full":false}' >/dev/null
job=""
for _ in $(seq 1 60); do job=$(api GET "/teams/$TEAM/server/maintenance"); [[ "$job" == *'"status":"running"'* ]] || break; sleep 1; done
check "in-app backup succeeded" has "$job" '"status":"success"'
pid_before=$(in_ct 'systemctl show -p MainPID --value teamflow')
api POST "/teams/$TEAM/server/maintenance/update" '{"version":"0.2.1"}' >/dev/null
check "server updated itself to 0.2.1" wait_version 0.2.1 180
check "DONE 0.2.1 logged" test "$(last_line DONE)" = "DONE 0.2.1"
check "new MainPID under systemd" test "$(in_ct 'systemctl show -p MainPID --value teamflow')" != "$pid_before"
check "current -> releases/v0.2.1" test "$(in_ct 'readlink /opt/teamflow/current')" = releases/v0.2.1
check "service active after in-app update" in_ct 'systemctl is-active --quiet teamflow'

section "Failed updates roll back under systemd"
set_latest 0.2.2
in_ct 'teamflow-update --version 0.2.2' >"$WORK/u-start.log" 2>&1 && bad "0.2.2 should fail" || ok "won't-start release: non-zero exit"
check "FAIL health" has "$(last_line FAIL)" "FAIL health"
check "back on 0.2.1" wait_version 0.2.1 60
check "service active after rollback" in_ct 'systemctl is-active --quiet teamflow'
in_ct 'teamflow-update --version 0.2.3' >"$WORK/u-migrate.log" 2>&1 && bad "0.2.3 should fail" || ok "broken migration: non-zero exit"
check "FAIL migrate" has "$(last_line FAIL)" "FAIL migrate"
check "back on 0.2.1" wait_version 0.2.1 60
login() { TOKEN='' api POST /auth/login '{"email":"admin@example.test","password":"correct-horse-battery"}'; }
check "admin still logs in" has "$(login)" token

section "Backup and restore (CLI)"
snap=$(in_ct 'teamflow-backup --db-only' | sed -n 's/^BACKUP database //p')
check "backup written" in_ct "test -s '$snap'"
api POST /teams '{"name":"After","key":"AFT"}' >/dev/null
teams_count() { api GET /teams | grep -o '"key":"[A-Z]*"' | wc -l; }
check "two teams before restore" test "$(teams_count)" = 2
in_ct "teamflow-restore --file '$(basename "$snap")'" >"$WORK/restore.log" 2>&1 || true
check "RESTORED logged" has "$(last_line RESTORED)" "RESTORED $(basename "$snap")"
check "answers after restore" wait_version 0.2.1 60
check "one team after restore" test "$(teams_count)" = 1

section "proxmox.sh --reuse: its installer command, run for real in this container"
set_latest 0.2.1
# Stub Proxmox tools; pct exec runs the command here, as if this container were CT 120.
in_ct 'mkdir -p /tmp/pve && cd /tmp/pve
cat >pct <<"EOF"
#!/usr/bin/env bash
echo "pct $*" >>/tmp/pve/log
case "$1" in
  status) [[ "$2" == 120 ]] && { echo "status: running"; exit 0; }; exit 2 ;;
  exec) shift 3; exec "$@" ;;
esac
EOF
printf "#!/usr/bin/env bash\necho 120\n" >pvesh
printf "#!/usr/bin/env bash\necho \"Name Type Status\"\necho \"local-lvm lvmthin active\"\n" >pvesm
printf "#!/usr/bin/env bash\necho pve-manager/8.3.0\n" >pveversion
printf "#!/usr/bin/env bash\nexit 0\n" >pveam
chmod +x pct pvesh pvesm pveversion pveam'
in_ct 'PATH=/tmp/pve:$PATH bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)" _ --yes --reuse --ctid 120' >"$WORK/proxmox-reuse.log" 2>&1 &&
  ok "proxmox.sh --reuse exit 0" || { tail -30 "$WORK/proxmox-reuse.log"; bad "proxmox.sh --reuse exit"; }
check "the installer ran inside (pct exec)" grep -q "Teamflow is running" "$WORK/proxmox-reuse.log"
check "printed the container address" grep -qE "Container 120 \(teamflow\) runs Teamflow at http://[0-9.]+:3000" "$WORK/proxmox-reuse.log"
check "no pct create on --reuse" in_ct '! grep -q "^pct create" /tmp/pve/log'
check "still on 0.2.1, data kept" wait_version 0.2.1 30
check "admin still logs in" has "$(login)" token
check "no new setup code on an existing server" in_ct '! test -e /opt/teamflow/data/setup-code'

section "Container restart (reboot)"
docker restart -t 30 "$CT" >/dev/null
check "systemd booted again" wait_systemd
check "service came back on its own" wait_version 0.2.1 60
check "service active" in_ct 'systemctl is-active --quiet teamflow'
check "admin still logs in after restart" has "$(login)" token

echo ""
echo "passed: $PASS   failed: ${#FAILS[@]}"
for f in "${FAILS[@]}"; do echo "  - $f"; done
[[ ${#FAILS[@]} -eq 0 ]]
