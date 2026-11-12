#!/usr/bin/env bash
# Integration test for the Linux release scripts, run as root inside a throwaway Debian 12
# container (no systemd there, so a stub systemctl runs the server in the background):
#
#   git ls-files -co --exclude-standard | tar -cf - -T - |
#     docker run --rm -i node:20-bookworm bash -c 'mkdir /src && tar -x -C /src && bash /src/deploy/tests/linux-release-test.sh'
#
# It builds a linux-x64 release from the source, serves fake GitHub releases from a local web
# server, and checks: shellcheck, the installer (fresh, re-run, setup link), update to a new
# version, failed migration, failed start, bad checksum and no network (each must roll back and
# keep the old version running), and backups.
set -euo pipefail

SRC="${SRC:-/src}"
APP_DIR=/opt/teamflow
PASS=0
FAILS=()

ok() { PASS=$((PASS + 1)); echo "  ok   $*"; }
bad() { FAILS+=("$*"); echo "  FAIL $*"; }
check() { local what=$1; shift; if "$@"; then ok "$what"; else bad "$what"; fi; }
section() { echo ""; echo "## $*"; }

section "Tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq sudo shellcheck >/dev/null
corepack enable >/dev/null 2>&1
# NodeSource installs node as /usr/bin/node, which the unit file uses; the node image has it elsewhere.
[[ -x /usr/bin/node ]] || ln -s "$(command -v node)" /usr/bin/node

section "shellcheck"
mapfile -t scripts < <(cd "$SRC" && ls deploy/proxmox-lxc/*.sh deploy/install/*.sh 2>/dev/null)
for s in "${scripts[@]}"; do
  check "shellcheck $s" shellcheck -x -S warning "$SRC/$s"
done

section "Build the release (this takes a minute)"
cd "$SRC"
BASE_TAR="$SRC/out/teamflow-v0.2.0-linux-x64.tar.gz"
if [[ ! -f "$BASE_TAR" || "${REBUILD:-1}" == 1 ]]; then
  pnpm install --frozen-lockfile >/tmp/install.log 2>&1 || { tail -30 /tmp/install.log; exit 1; }
  node scripts/package-release.mjs --version 0.2.0 >/tmp/package.log 2>&1 || { tail -30 /tmp/package.log; exit 1; }
fi
ok "packaged $(du -h "$BASE_TAR" | cut -f1)"

# ---- fake GitHub -------------------------------------------------------------------------------
REL=/srv/releases
mkdir -p "$REL/download" "$REL/api"
# make_release <version> [mutation]: repack the base release as another version.
make_release() {
  local v=$1 mutate=${2:-} dir
  dir=$(mktemp -d)
  tar -xzf "$BASE_TAR" -C "$dir"
  node -e 'const f=process.argv[1];const j=JSON.parse(require("fs").readFileSync(f));j.version=process.argv[2];require("fs").writeFileSync(f,JSON.stringify(j))' "$dir/version.json" "$v"
  case "$mutate" in
    break-migrate) echo 'console.error("boom: migration failed"); process.exit(1);' >"$dir/apps/server/dist/migrate.js" ;;
    break-start) echo 'console.error("boom: cannot start"); process.exit(1);' >"$dir/apps/server/dist/index.js" ;;
  esac
  mkdir -p "$REL/download/v$v"
  tar -czf "$REL/download/v$v/teamflow-v$v-linux-x64.tar.gz" -C "$dir" .
  (cd "$REL/download/v$v" && sha256sum "teamflow-v$v-linux-x64.tar.gz" >SHA256SUMS)
  if [[ "$mutate" == "bad-checksum" ]]; then
    (cd "$REL/download/v$v" && echo "0000000000000000000000000000000000000000000000000000000000000000  teamflow-v$v-linux-x64.tar.gz" >SHA256SUMS)
  fi
  cp "$SRC/deploy/install/install.sh" "$REL/download/v$v/install.sh" 2>/dev/null || true
  rm -rf "$dir"
}
set_latest() { printf '{"tag_name":"v%s","draft":false,"prerelease":false}' "$1" >"$REL/api/latest"; }

make_release 0.2.0
make_release 0.2.1
make_release 0.2.2 break-migrate
make_release 0.2.3 break-start
make_release 0.2.4 bad-checksum
set_latest 0.2.0

cat >/tmp/fake-github.mjs <<'EOF'
import http from "node:http";
import fs from "node:fs";
const root = "/srv/releases";
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = null;
  if (url.pathname === "/repos/mrcool5556/teamflow/releases/latest") file = `${root}/api/latest`;
  else if (url.pathname.startsWith("/download/")) file = root + url.pathname;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200); fs.createReadStream(file).pipe(res);
}).listen(8099, "127.0.0.1");
EOF
node /tmp/fake-github.mjs &
sleep 1
export TEAMFLOW_RELEASE_BASE=http://127.0.0.1:8099/download
export TEAMFLOW_API_BASE=http://127.0.0.1:8099/repos/mrcool5556/teamflow

# ---- stub systemctl (no systemd in a container) ------------------------------------------------
cat >/usr/local/bin/fake-systemctl <<'EOF'
#!/usr/bin/env bash
# Runs teamflow.service's ExecStart as the app user in the background.
pidfile=/run/teamflow.pid
if [[ "${2:-}" == teamflow-discord ]]; then
  # The bot's unit: record the call; on restart run its ExecStart once, as the unit says.
  echo "$1" >>/tmp/bot-calls.log
  unit=/etc/systemd/system/teamflow-discord.service
  case "$1" in
    is-enabled) [[ -f $unit ]] ;;
    restart|start)
      exec_start=$(sed -n 's/^ExecStart=//p' $unit)
      workdir=$(sed -n 's/^WorkingDirectory=//p' $unit)
      envfile=$(sed -n 's/^EnvironmentFile=//p' $unit)
      (cd "$workdir" && set -a && . "$envfile" && set +a && timeout 30 runuser -u teamflow -- $exec_start) >/tmp/bot.log 2>&1 || true
      ;;
  esac
  exit 0
fi
case "$1" in
  start|restart)
    if [[ "$1" == restart && -f $pidfile ]]; then kill "$(cat $pidfile)" 2>/dev/null || true; sleep 1; fi
    exec_start=$(sed -n 's/^ExecStart=//p' /etc/systemd/system/teamflow.service)
    workdir=$(sed -n 's/^WorkingDirectory=//p' /etc/systemd/system/teamflow.service)
    user=$(sed -n 's/^User=//p' /etc/systemd/system/teamflow.service)
    (cd "$workdir" && set -a && . ./.env && set +a && exec runuser -u "${user:-teamflow}" -- $exec_start) >>/tmp/teamflow-service.log 2>&1 &
    echo $! >$pidfile
    ;;
  stop)
    if [[ -f $pidfile ]]; then pkill -P "$(cat $pidfile)" 2>/dev/null || true; kill "$(cat $pidfile)" 2>/dev/null || true; rm -f $pidfile; sleep 1; fi
    ;;
  is-active) [[ -f $pidfile ]] && kill -0 "$(cat $pidfile)" 2>/dev/null ;;
  *) : ;;
esac
EOF
chmod +x /usr/local/bin/fake-systemctl
export TEAMFLOW_SYSTEMCTL=/usr/local/bin/fake-systemctl

health() { curl -fsS --max-time 2 http://127.0.0.1:3000/health 2>/dev/null || true; }
running_version() { health | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
last_line() { grep -E "^$1 " $APP_DIR/data/maintenance.log | tail -n1; }

# ---- install -----------------------------------------------------------------------------------
section "Installer (fresh)"
if [[ -f "$SRC/deploy/install/install.sh" ]]; then
  bash "$SRC/deploy/install/install.sh" --yes >/tmp/install-run.log 2>&1 || { tail -40 /tmp/install-run.log; bad "install.sh exit"; }
  check "install.sh printed an address" grep -q "http://" /tmp/install-run.log
  check "secrets generated" grep -qE '^JWT_SECRET=[0-9a-f]{64}$' $APP_DIR/.env
  check ".env mode 600" test "$(stat -c %a $APP_DIR/.env)" = 600
  check "current → v0.2.0" test "$(readlink $APP_DIR/current)" = releases/v0.2.0
  check "release is root-owned" test "$(stat -c %U $APP_DIR/releases/v0.2.0)" = root
  check "apps link" test "$(readlink $APP_DIR/apps)" = current/apps
  check "sudoers rule" test -f /etc/sudoers.d/teamflow-maintenance
  check "running v0.2.0" test "$(running_version)" = 0.2.0
  secret_before=$(grep '^TEAMFLOW_SECRETS_KEY=' $APP_DIR/.env)

  section "Installer (re-run keeps secrets and data)"
  bash "$SRC/deploy/install/install.sh" --yes >/tmp/install-rerun.log 2>&1 || { tail -40 /tmp/install-rerun.log; bad "install.sh re-run exit"; }
  check "secrets unchanged" test "$(grep '^TEAMFLOW_SECRETS_KEY=' $APP_DIR/.env)" = "$secret_before"
  check "still running v0.2.0" test "$(running_version)" = 0.2.0
else
  echo "  (deploy/install/install.sh not written yet: laying out v0.2.0 by hand)"
  id teamflow >/dev/null 2>&1 || useradd -r -m -d /home/teamflow -s /usr/sbin/nologin teamflow
  mkdir -p $APP_DIR/releases/v0.2.0 $APP_DIR/data
  tar -xzf "$REL/download/v0.2.0/teamflow-v0.2.0-linux-x64.tar.gz" -C $APP_DIR/releases/v0.2.0 --no-same-owner
  ln -sfn releases/v0.2.0 $APP_DIR/current
  ln -sfn current/apps $APP_DIR/apps
  ln -sfn current/deploy $APP_DIR/deploy
  {
    echo "NODE_ENV=production"
    echo "PORT=3000"
    echo "DATABASE_URL=file:./data/teamflow.db"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "TEAMFLOW_SECRETS_KEY=$(openssl rand -hex 32)"
    echo "TEAMFLOW_MAINTENANCE_ENABLED=true"
  } >$APP_DIR/.env
  chown teamflow:teamflow $APP_DIR/.env $APP_DIR/data
  chmod 600 $APP_DIR/.env
  cp $APP_DIR/deploy/proxmox-lxc/teamflow.service /etc/systemd/system/teamflow.service
  (cd $APP_DIR && runuser -u teamflow -- node apps/server/dist/migrate.js >/dev/null)
  bash $APP_DIR/deploy/proxmox-lxc/setup-maintenance-sudo.sh >/dev/null
  fake-systemctl start
  for _ in $(seq 1 30); do [[ "$(running_version)" == 0.2.0 ]] && break; sleep 1; done
  check "running v0.2.0" test "$(running_version)" = 0.2.0 || tail -20 /tmp/teamflow-service.log
fi

# Data that must survive every update and rollback.
(cd $APP_DIR && runuser -u teamflow -- node -e '
  const D=require("/opt/teamflow/current/node_modules/better-sqlite3");
  const db=new D("data/teamflow.db"); db.exec("CREATE TABLE IF NOT EXISTS canary(v TEXT)"); db.prepare("INSERT INTO canary VALUES (?)").run("keep-me"); db.close();')
canary() { (cd $APP_DIR && node -e 'const D=require("/opt/teamflow/current/node_modules/better-sqlite3");const db=new D("data/teamflow.db",{readonly:true});console.log(db.prepare("SELECT count(*) n FROM canary").get().n)'); }

# ---- updates -----------------------------------------------------------------------------------
section "Update to the latest (v0.2.1)"
set_latest 0.2.1
bash $APP_DIR/deploy/proxmox-lxc/update.sh >/tmp/u1.log 2>&1 || true
check "DONE 0.2.1" test "$(last_line DONE)" = "DONE 0.2.1"
check "running v0.2.1" test "$(running_version)" = 0.2.1
check "current → v0.2.1" test "$(readlink $APP_DIR/current)" = releases/v0.2.1
check "data kept" test "$(canary)" = 1
check "a database backup exists" bash -c 'ls /var/backups/teamflow/teamflow_*.db >/dev/null'
check "update logged STEP lines" bash -c "grep -c '^STEP ' $APP_DIR/data/maintenance.log | grep -q '[5-9]'"

section "Already up to date"
bash $APP_DIR/deploy/proxmox-lxc/update.sh >/tmp/u1b.log 2>&1 || true
check "no-op DONE" grep -q "Already on v0.2.1" $APP_DIR/data/maintenance.log

section "Failed migration rolls back"
bash $APP_DIR/deploy/proxmox-lxc/update.sh --version 0.2.2 >/tmp/u2.log 2>&1 && bad "exit code should be non-zero" || ok "non-zero exit"
check "FAIL migrate" bash -c "test \"\$(grep -E '^FAIL ' $APP_DIR/data/maintenance.log | tail -n1 | cut -d' ' -f2)\" = migrate"
check "still running v0.2.1" test "$(running_version)" = 0.2.1
check "current still v0.2.1" test "$(readlink $APP_DIR/current)" = releases/v0.2.1
check "data kept" test "$(canary)" = 1

section "Release that will not start rolls back"
bash $APP_DIR/deploy/proxmox-lxc/update.sh --version 0.2.3 >/tmp/u3.log 2>&1 && bad "exit code should be non-zero" || ok "non-zero exit"
check "FAIL health" bash -c "test \"\$(grep -E '^FAIL ' $APP_DIR/data/maintenance.log | tail -n1 | cut -d' ' -f2)\" = health"
check "running v0.2.1 again" test "$(running_version)" = 0.2.1
check "current back to v0.2.1" test "$(readlink $APP_DIR/current)" = releases/v0.2.1
check "data kept" test "$(canary)" = 1

section "Bad checksum is refused before stopping"
bash $APP_DIR/deploy/proxmox-lxc/update.sh --version 0.2.4 >/tmp/u4.log 2>&1 && bad "exit code should be non-zero" || ok "non-zero exit"
check "FAIL checksum" bash -c "grep -E '^FAIL ' $APP_DIR/data/maintenance.log | tail -n1 | grep -q '^FAIL checksum'"
check "still running v0.2.1" test "$(running_version)" = 0.2.1

section "No network"
TEAMFLOW_RELEASE_BASE=http://127.0.0.1:1/download bash $APP_DIR/deploy/proxmox-lxc/update.sh --version 0.2.9 >/tmp/u5.log 2>&1 && bad "exit code should be non-zero" || ok "non-zero exit"
check "FAIL network" bash -c "grep -E '^FAIL ' $APP_DIR/data/maintenance.log | tail -n1 | grep -q '^FAIL network'"
check "still running v0.2.1" test "$(running_version)" = 0.2.1

section "Guards"
bash $APP_DIR/deploy/proxmox-lxc/update.sh --version 0.2.0 >/tmp/u6.log 2>&1 && bad "downgrade should be refused" || ok "downgrade refused"
bash $APP_DIR/deploy/proxmox-lxc/update.sh --branch main >/tmp/u7.log 2>&1 && bad "--branch should be refused" || ok "--branch refused"
check "app user may run the update through sudo" runuser -u teamflow -- sudo -n /usr/local/lib/teamflow/update.sh --help
check "app user cannot redirect downloads" bash -c "! runuser -u teamflow -- sudo -n TEAMFLOW_RELEASE_BASE=http://evil /usr/local/lib/teamflow/update.sh --help 2>/dev/null"

section "Backup"
bash $APP_DIR/deploy/proxmox-lxc/backup.sh --db-only >/tmp/b.log 2>&1
check "online backup is a valid database" bash -c "f=\$(sed -n 's/^BACKUP database //p' /tmp/b.log); test -s \"\$f\" && head -c 15 \"\$f\" | grep -q 'SQLite format 3'"

section "Restore"
out=$(bash $APP_DIR/deploy/proxmox-lxc/backup.sh --db-only)
snap=$(basename "$(printf '%s\n' "$out" | sed -n 's/^BACKUP database //p')")
(cd $APP_DIR && runuser -u teamflow -- node -e '
  const D=require("/opt/teamflow/current/node_modules/better-sqlite3");
  const db=new D("data/teamflow.db"); db.prepare("INSERT INTO canary VALUES (?)").run("after-snapshot"); db.close();')
check "two canary rows before restore" test "$(canary)" = 2
bash $APP_DIR/deploy/proxmox-lxc/restore.sh --file "$snap" >/tmp/r1.log 2>&1 || true
check "RESTORED line" grep -q "^RESTORED $snap" $APP_DIR/data/maintenance.log
check "database is back to the snapshot" test "$(canary)" = 1
check "server answers after restore" test "$(running_version)" = 0.2.1
bash $APP_DIR/deploy/proxmox-lxc/restore.sh --file ../../etc/passwd >/tmp/r2.log 2>&1 && bad "path should be refused" || ok "path refused"
check "app user may run restore through sudo" runuser -u teamflow -- sudo -n /usr/local/lib/teamflow/restore.sh --help

section "Backup retention (keep N, never checkpoints)"
BK=/var/backups/teamflow
rm -f $BK/teamflow_* $BK/teamflow-*
# What CT998 has besides automatic backups: named checkpoints, .env copies and a stray file.
keepers=(teamflow-pre-0.2.0.db teamflow_db_pre-0.2.1.db teamflow_2026-06-01_120000-before-releases.db
  teamflow_env_pre-0.2.0 notes.txt)
for f in "${keepers[@]}"; do echo keep >"$BK/$f"; touch -d '2026-01-01' "$BK/$f"; done
for d in 01 02 03 04 05; do
  echo old >"$BK/teamflow_2026-06-${d}_120000.db"; touch -d "2026-06-$d" "$BK/teamflow_2026-06-${d}_120000.db"
  echo old >"$BK/teamflow_uploads_2026-06-${d}_120000.tar.gz"; touch -d "2026-06-$d" "$BK/teamflow_uploads_2026-06-${d}_120000.tar.gz"
done
count() { find $BK -maxdepth 1 -type f -regextype posix-extended -regex "$1" | wc -l; }
DBS='.*/teamflow_[0-9-]{10}_[0-9]{6}(-[0-9]+)?\.db'
UPS='.*/teamflow_uploads_[0-9-]{10}_[0-9]{6}(-[0-9]+)?\.tar\.gz'
mkdir -p $APP_DIR/data/uploads && echo hi >$APP_DIR/data/uploads/a.txt
printf '{\n  "keepDatabaseBackups": 3,\n  "keepUploadArchives": 2\n}\n' >$APP_DIR/data/backup-settings.json
chown teamflow:teamflow $APP_DIR/data/backup-settings.json
bash $APP_DIR/deploy/proxmox-lxc/backup.sh --full >/tmp/bk1.log 2>&1 || { cat /tmp/bk1.log; bad "full backup exit"; }
check "keeps 3 database backups (setting)" test "$(count "$DBS")" = 3
check "keeps 2 upload archives (setting)" test "$(count "$UPS")" = 2
check "the new backups are among those kept" bash -c "test -f \"\$(sed -n 's/^BACKUP database //p' /tmp/bk1.log)\" && test -f \"\$(sed -n 's/^BACKUP uploads //p' /tmp/bk1.log)\""
check "the oldest were pruned" test ! -e $BK/teamflow_2026-06-01_120000.db
check "PRUNED lines logged" grep -q "^PRUNED database teamflow_2026-06-01_120000.db" /tmp/bk1.log
for f in "${keepers[@]}"; do check "untouched: $f" test "$(cat "$BK/$f")" = keep; done
check "folder is root:teamflow 750" test "$(stat -c '%U:%G %a' $BK)" = "root:teamflow 750"
check "backup files stay 600" test "$(stat -c %a "$(sed -n 's/^BACKUP database //p' /tmp/bk1.log)")" = 600
check "app user can list the folder" runuser -u teamflow -- ls $BK >/dev/null
echo '{"keepDatabaseBackups": 500, "keepUploadArchives": "x"}' >$APP_DIR/data/backup-settings.json
check "out-of-range setting means the default (10)" test "$(bash $APP_DIR/deploy/proxmox-lxc/backup-files.sh keep database)" = 10
check "bad value means the default (1)" test "$(bash $APP_DIR/deploy/proxmox-lxc/backup-files.sh keep uploads)" = 1
ln -sf /etc/hostname $APP_DIR/data/backup-settings.json
check "a linked settings file is ignored" test "$(bash $APP_DIR/deploy/proxmox-lxc/backup-files.sh keep database)" = 10
rm -f $APP_DIR/data/backup-settings.json
check "no settings file: default 10" test "$(bash $APP_DIR/deploy/proxmox-lxc/backup-files.sh keep database)" = 10

newest=$(basename "$(sed -n 's/^BACKUP database //p' /tmp/bk1.log)")
older=$(cd $BK && ls -t teamflow_2026-06-0*_120000.db | tail -n1)
files_sudo() { runuser -u teamflow -- sudo -n /usr/local/lib/teamflow/backup-files.sh "$@"; }
files_sudo delete "$newest" >/tmp/del1.log 2>&1 && bad "newest database backup deleted" || ok "newest database backup refused"
check "...says why" grep -q "^FAIL newest" /tmp/del1.log
check "...still there" test -f "$BK/$newest"
check "app user deletes an older one through sudo" files_sudo delete "$older"
check "...gone" test ! -e "$BK/$older"
check "app user deletes a checkpoint by name" files_sudo delete teamflow_env_pre-0.2.0
files_sudo delete ../../etc/passwd >/dev/null 2>&1 && bad "path deleted" || ok "path refused"
files_sudo delete notes.txt >/dev/null 2>&1 && bad "non-Teamflow file deleted" || ok "non-Teamflow file refused"
check "...notes.txt still there" test -f $BK/notes.txt
ln -s /etc/passwd $BK/teamflow_link.db
files_sudo delete teamflow_link.db >/dev/null 2>&1 && bad "link deleted" || ok "link refused"
check "...link target intact" test -s /etc/passwd
rm -f $BK/teamflow_link.db

section "Releases kept"
check "at most two releases on disk" bash -c "test \$(ls -d $APP_DIR/releases/v* | wc -l) -le 2"

section "Proxmox one-liner (stubbed pct/pveam: no Proxmox here)"
mkdir -p /tmp/pve/bin
cat >/tmp/pve/bin/pct <<'STUB'
#!/usr/bin/env bash
echo "pct $*" >>/tmp/pve.log
case "$1" in
  status) [[ "$2" == 998 ]] && { echo "status: running"; exit 0; }; exit 2 ;;
  exec)
    shift 3
    case "$*" in
      *getent*) exit 0 ;;
      *"hostname -I"*) echo "10.0.0.5" ;;
      *) exit 0 ;;
    esac
    ;;
esac
exit 0
STUB
cat >/tmp/pve/bin/pveam <<'STUB'
#!/usr/bin/env bash
echo "pveam $*" >>/tmp/pve.log
if [[ "$1" == available ]]; then
  printf 'system          debian-11-standard_11.7-1_amd64.tar.zst\nsystem          debian-12-standard_12.2-1_amd64.tar.zst\nsystem          debian-12-standard_12.7-1_amd64.tar.zst\nsystem          ubuntu-24.04-standard_24.04-2_amd64.tar.zst\n'
fi
exit 0
STUB
printf '#!/usr/bin/env bash\necho "pvesh $*" >>/tmp/pve.log\necho 120\n' >/tmp/pve/bin/pvesh
printf '#!/usr/bin/env bash\necho "Name Type Status Total Used Available %%"\necho "local-lvm lvmthin active 100 1 99 1%%"\n' >/tmp/pve/bin/pvesm
printf '#!/usr/bin/env bash\necho "pve-manager/8.3.0/xxxx (running kernel: 6.8)"\n' >/tmp/pve/bin/pveversion
chmod +x /tmp/pve/bin/*
pve() { PATH="/tmp/pve/bin:$PATH" bash "$SRC/deploy/install/proxmox.sh" "$@"; }

: >/tmp/pve.log
pve --yes --dry-run >/tmp/pve-dry.log 2>&1 || { tail -20 /tmp/pve-dry.log; bad "proxmox dry run exit"; }
check "dry run shows pct create with nesting, unprivileged, onboot" grep -qE "\[dry-run\] pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst .*--unprivileged 1 --features nesting=1 --onboot 1" /tmp/pve-dry.log
check "dry run created nothing" bash -c '! grep -qE "^pct (create|start|exec)|^pveam download" /tmp/pve.log'

: >/tmp/pve.log
pve --yes --memory 2048 >/tmp/pve-run.log 2>&1 || { tail -20 /tmp/pve-run.log; bad "proxmox run exit"; }
check "downloads the newest Debian 12 template" grep -q "^pveam download local debian-12-standard_12.7-1_amd64.tar.zst" /tmp/pve.log
check "creates CT 120 with the chosen memory on local-lvm" grep -qE "^pct create 120 .*--memory 2048 .*--rootfs local-lvm:8 .*--net0 name=eth0,bridge=vmbr0,ip=dhcp" /tmp/pve.log
check "starts it" grep -q "^pct start 120" /tmp/pve.log
check "runs the Linux installer inside" grep -qE "^pct exec 120 -- bash -c .*releases/latest/download/install.sh' \| TEAMFLOW_YES=1 TEAMFLOW_PORT=3000 bash" /tmp/pve.log
check "prints the address" grep -q "runs Teamflow at http://10.0.0.5:3000" /tmp/pve-run.log

: >/tmp/pve.log
pve --yes --ctid 998 >/tmp/pve-998.log 2>&1 && bad "an existing CT must be refused" || ok "existing CT 998 refused without --reuse"
check "nothing ran against CT 998" bash -c '! grep -qE "^pct (create|start|exec|set|destroy|stop)" /tmp/pve.log'
pve --yes --ip 192.168.1.50/24 >/tmp/pve-ip.log 2>&1 && bad "static IP without gateway must be refused" || ok "static IP needs a gateway"

section "Dry run changes nothing"
before=$(find $APP_DIR -maxdepth 2 -printf '%p %s\n' | sort | sha256sum)
bash "$SRC/deploy/install/install.sh" --dry-run >/tmp/dry.log 2>&1 || { tail -20 /tmp/dry.log; bad "dry run exit"; }
check "dry run says so" grep -q "Dry run finished" /tmp/dry.log
check "dry run changed nothing" test "$(find $APP_DIR -maxdepth 2 -printf '%p %s\n' | sort | sha256sum)" = "$before"

section "Installer switches a git-checkout server to releases (the CT998 path)"
/usr/local/bin/fake-systemctl stop || true
rm -rf $APP_DIR /etc/systemd/system/teamflow.service /tmp/bot-calls.log
mkdir -p $APP_DIR/.git $APP_DIR/data $APP_DIR/apps/server $APP_DIR/apps/discord-bot $APP_DIR/deploy
echo "DISCORD_TOKEN=old-style" >$APP_DIR/apps/discord-bot/.env
# CT998 runs the Discord bot from the repo's unit, which reads data/discord-bot.env.
tr -d '\r' <"$SRC/deploy/proxmox-lxc/teamflow-discord.service" >/etc/systemd/system/teamflow-discord.service
printf 'TEAMFLOW_URL=http://127.0.0.1:3000\nTEAMFLOW_BOT_CONFIG_KEY=not-set-on-the-server\n' >$APP_DIR/data/discord-bot.env
legacy_jwt=$(openssl rand -hex 32)
cat >$APP_DIR/.env <<ENV
PORT=3000
HOST=0.0.0.0
DATABASE_URL=file:./data/teamflow.db
JWT_SECRET=$legacy_jwt
PUBLIC_URL=http://teamflow.example
SERVE_WEB=true
WEB_DIST=/opt/teamflow/apps/web/dist
TEAMFLOW_MAINTENANCE_ENABLED=true
TEAMFLOW_APP_DIR=/opt/teamflow
ENV
tmprel=$(mktemp -d)
tar -xzf "$REL/download/v0.2.0/teamflow-v0.2.0-linux-x64.tar.gz" -C "$tmprel"
(cd $APP_DIR && node "$tmprel/apps/server/dist/migrate.js" >/dev/null && node -e '
  const D=require(process.argv[1]); const db=new D("data/teamflow.db");
  db.exec("CREATE TABLE canary(v TEXT)"); db.prepare("INSERT INTO canary VALUES (?)").run("legacy"); db.close();' "$tmprel/node_modules/better-sqlite3")
# A secret saved the way CT998 saved its Discord settings: no TEAMFLOW_SECRETS_KEY, so JWT_SECRET.
(cd $APP_DIR && env -i PATH="$PATH" NODE_ENV=production JWT_SECRET="$legacy_jwt" node --input-type=module -e '
  const m = await import(process.argv[1]); process.stdout.write(m.encryptSecret("discord-bot-token-123"));' \
  "$tmprel/apps/server/dist/lib/secretsCrypto.js" 2>/dev/null) >/tmp/legacy-secret.blob || true
check "legacy secret encrypted with the JWT_SECRET fallback" grep -q '^v2:' /tmp/legacy-secret.blob
# decrypt_with <env file>: decrypt it as the service would, with that file's values.
decrypt_with() {
  (cd $APP_DIR && env -i PATH="$PATH" bash -c 'set -a; . "$1"; set +a; node --input-type=module -e "
    const m = await import(process.argv[1]); process.stdout.write(m.decryptSecret(process.argv[2]));" \
    "$2" "$3"' _ "$1" "$APP_DIR/apps/server/dist/lib/secretsCrypto.js" "$(cat /tmp/legacy-secret.blob)" 2>/dev/null) || true
}
chown -R teamflow:teamflow $APP_DIR
set_latest 0.2.1
# No terminal (as from cron or ssh without -t) and no --yes: it must ask, so it must stop.
setsid bash "$SRC/deploy/install/install.sh" </dev/null >/tmp/convert-notty.log 2>&1 && bad "converted without a terminal or --yes" || ok "no terminal, no --yes: refuses to convert"
check "...says to use --yes" grep -q "Re-run with --yes" /tmp/convert-notty.log
check "...checkout untouched" test -d $APP_DIR/.git

# The dry run must show the whole switch, although it leaves the checkout's apps/ in place.
dry_before=$(find $APP_DIR -printf '%p %s\n' | sort | sha256sum)
bash "$SRC/deploy/install/install.sh" --dry-run --yes >/tmp/convert-dry.log 2>&1 && ok "conversion dry run exit 0" || { tail -20 /tmp/convert-dry.log; bad "conversion dry run exit"; }
dry_has() { grep -qF -- "$1" /tmp/convert-dry.log; }
check "...did not stop at the apps folder" bash -c '! grep -q "expected a link" /tmp/convert-dry.log'
check "...shows the checkout move" dry_has "[dry-run] mv $APP_DIR $APP_DIR.git-"
check "...shows the apps link" dry_has "[dry-run] ln -sfn current/apps $APP_DIR/apps"
check "...shows the deploy link" dry_has "[dry-run] ln -sfn current/deploy $APP_DIR/deploy"
check "...shows the migration" dry_has "[dry-run] migrate the database"
check "...shows the unit" dry_has "[dry-run] install teamflow.service"
check "...shows the sudo rule" dry_has "setup-maintenance-sudo.sh"
check "...shows the Discord bot restart" dry_has "[dry-run] restart teamflow-discord.service"
check "...shows the health check" dry_has "[dry-run] wait for http://127.0.0.1:3000/health"
check "...keeps the secrets key unset" dry_has "TEAMFLOW_SECRETS_KEY stays unset"
check "...finished" dry_has "Dry run finished"
check "...changed nothing" test "$(find $APP_DIR -printf '%p %s\n' | sort | sha256sum)" = "$dry_before"
check "...did not touch the bot" test ! -f /tmp/bot-calls.log
bash "$SRC/deploy/install/install.sh" --yes >/tmp/convert.log 2>&1 || { tail -30 /tmp/convert.log; bad "conversion exit"; }
check "checkout kept aside" bash -c 'ls -d /opt/teamflow.git-* >/dev/null'
check "current is a release" test "$(readlink $APP_DIR/current)" = releases/v0.2.1
check "running v0.2.1" test "$(running_version)" = 0.2.1
check "JWT_SECRET kept" grep -q "^JWT_SECRET=$legacy_jwt\$" $APP_DIR/.env
check "no TEAMFLOW_SECRETS_KEY added (the JWT_SECRET fallback stays)" bash -c "! grep -q '^TEAMFLOW_SECRETS_KEY' $APP_DIR/.env"
check "secret saved before the switch still decrypts" test "$(decrypt_with $APP_DIR/.env)" = discord-bot-token-123
cp $APP_DIR/.env /tmp/newkey.env; echo "TEAMFLOW_SECRETS_KEY=$(openssl rand -hex 32)" >>/tmp/newkey.env
check "...and a new key would not have decrypted it" test -z "$(decrypt_with /tmp/newkey.env)"
check "WEB_DIST=/opt/teamflow/apps/web/dist resolves" test -f /opt/teamflow/apps/web/dist/index.html
check "...and the web app is served" bash -c 'curl -fsS http://127.0.0.1:3000/ | grep -qi "<html"'
check "TEAMFLOW_APP_DIR=/opt/teamflow holds .env and data" test -f /opt/teamflow/.env -a -f /opt/teamflow/data/teamflow.db
check "bot folder resolves through apps -> current/apps" test "$(readlink -f $APP_DIR/apps/discord-bot)" = $APP_DIR/releases/v0.2.1/apps/discord-bot
check "Discord bot stopped before the move, restarted after" test "$(tr '\n' ' ' </tmp/bot-calls.log)" = "stop restart "
check "Discord bot loaded its modules from the release" bash -c '! grep -qE "ERR_MODULE_NOT_FOUND|Cannot find (module|package)" /tmp/bot.log'
check "...read data/discord-bot.env and reached the server" grep -q "Server has no TEAMFLOW_BOT_CONFIG_KEY" /tmp/bot.log
grep -q "Server has no TEAMFLOW_BOT_CONFIG_KEY" /tmp/bot.log || sed 's/^/    bot: /' /tmp/bot.log | head -20
check "...old apps/discord-bot/.env is pointed out" grep -q "apps/discord-bot/.env is not carried over" /tmp/convert.log
check "PUBLIC_URL kept" grep -q "^PUBLIC_URL=http://teamflow.example$" $APP_DIR/.env
check "legacy data kept" test "$(canary)" = 1
check "a pre-conversion backup exists" bash -c 'ls /var/backups/teamflow/*before-releases.db >/dev/null'
check "printed the address" grep -q "Teamflow is running" /tmp/convert.log

TEAMFLOW_SYSTEMCTL=/usr/local/bin/fake-systemctl /usr/local/bin/fake-systemctl stop || true
echo ""
echo "passed: $PASS   failed: ${#FAILS[@]}"
for f in "${FAILS[@]}"; do echo "  - $f"; done
[[ ${#FAILS[@]} -eq 0 ]]
