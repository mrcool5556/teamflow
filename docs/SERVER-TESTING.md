# Server testing (production LXC)

Use this when debugging production issues (502 after update, maintenance jobs, version drift, etc.). The AI agent can run these checks over SSH from your Windows machine.

## SSH access

See [CONNECTIONS.md](CONNECTIONS.md) for host, user, and key path.

Recommended `~/.ssh/config` entry (Windows: `C:\Users\<you>\.ssh\config`):

```sshconfig
Host teamflow
  HostName 192.168.1.103
  User root
  IdentityFile ~/.ssh/codex_proxmox
```

Verify:

```powershell
ssh teamflow hostname
# expected: teamflow
```

## One-shot diagnostic

From the repo root on your dev machine:

```powershell
Get-Content deploy/proxmox-lxc/diagnose.sh | ssh teamflow bash
```

Or after the script is on the server:

```bash
ssh teamflow bash /opt/teamflow/deploy/proxmox-lxc/diagnose.sh
```

## Common checks

| Symptom | Commands |
|---------|----------|
| Site 502 | `ssh teamflow "systemctl status teamflow; tail -30 /opt/teamflow/data/maintenance.log"` |
| Update stuck / log stops at `App dir:` | `ssh teamflow "grep KillMode /etc/systemd/system/teamflow.service"` — must be `KillMode=process` |
| Build failed | `ssh teamflow "journalctl -u teamflow -n 50 --no-pager; ls -la /opt/teamflow/apps/web/dist"` |
| Git behind origin | `ssh teamflow "sudo -u teamflow git -C /opt/teamflow fetch origin && sudo -u teamflow git -C /opt/teamflow log -1 --oneline origin/main"` |
| Test update manually | `ssh teamflow "tail -f /opt/teamflow/data/maintenance.log"` in one terminal, `ssh teamflow "sudo /usr/local/bin/teamflow-update"` in another |

## Safe vs destructive

**Safe (agent may run without asking):**

- `diagnose.sh`, `systemctl status`, `journalctl`, `tail` logs, `curl` health, read-only `git` as `teamflow`

**Ask first:**

- `systemctl restart teamflow`, `teamflow-update`, `git pull`, `pnpm build`, editing `/etc/systemd/system/teamflow.service`

## Paths

| Path | Purpose |
|------|---------|
| `/opt/teamflow` | App root |
| `/opt/teamflow/data/maintenance.log` | In-app / CLI update log |
| `/etc/systemd/system/teamflow.service` | systemd unit |
| `/usr/local/bin/teamflow-update` | Update wrapper |
| `/usr/local/bin/teamflow-backup` | Backup wrapper |

Fix procedures: [deploy/proxmox-lxc/README.md](../deploy/proxmox-lxc/README.md) (KillMode, manual deploy, sudoers).
