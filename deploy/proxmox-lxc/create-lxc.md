# Create Teamflow LXC on Proxmox

## 1. Create CT

- **Datacenter** → your node → **Create CT**
- **General**: hostname `teamflow`, password for root
- **Template**: `debian-12-standard` or `ubuntu-24.04-standard`
- **Disks**: 20 GB
- **CPU**: 2 cores
- **Memory**: 2048–4096 MB
- **Network**: bridge `vmbr0`, static IP recommended (e.g. `192.168.1.50`)

## 2. Start container

```bash
pct start <CTID>
pct enter <CTID>
# or: ssh root@192.168.1.50
```

## 3. Prepare

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates
```

## 4. Clone Teamflow

```bash
mkdir -p /opt
cd /opt
git clone <your-repo-url> teamflow
cd teamflow
```

Or copy from your dev machine with `scp -r`.

## 5. Install

```bash
sudo bash deploy/proxmox-lxc/install.sh
```

## 6. Verify

```bash
systemctl status teamflow
curl http://localhost:3000/health
```

From your PC: `http://<lxc-ip>:3000`

For remote access without port forwarding, set up relay (Tailscale) — see `deploy/relay/README.md`.
