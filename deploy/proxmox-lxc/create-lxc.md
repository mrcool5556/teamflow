# Create the Teamflow container by hand

The quick way is one line on the Proxmox host, which does all of this for you:

```bash
bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)"
```

To do it in the Proxmox UI instead:

## 1. Create CT

- **Datacenter** → your node → **Create CT**
- **General**: hostname `teamflow`, a root password, **Unprivileged container** ticked, and under **Features** (after creation: Options → Features) **Nesting** on; systemd in the container needs it
- **Template**: `debian-12-standard` (download it under local → CT Templates → Templates if missing) or `ubuntu-24.04-standard`
- **Disks**: 8 GB or more (Teamflow needs under 1 GB; keep more than 2 GB free for uploads)
- **CPU**: 2 cores
- **Memory**: 1024 MB or more
- **Network**: bridge `vmbr0`, DHCP or a static IP (e.g. `192.168.1.50/24` with your gateway)
- **Confirm**: tick **Start after created**; under Options set **Start at boot** to Yes

## 2. Install Teamflow

Open the container's **Console** (or `pct enter <CTID>` on the host) and, as root:

```bash
apt update && apt install -y curl
curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | bash
```

The installer adds what else it needs (`sudo`, Node 20), sets up the service and prints the address and the one-time setup link.

## 3. Finish setup

Open the printed link, `http://<container-ip>:3000/setup?code=XXXX-XXXX`, from your PC and create the admin account. Check the service any time with:

```bash
systemctl status teamflow
curl http://localhost:3000/health
```

For remote access without port forwarding, set up the relay (Tailscale): see [../relay/README.md](../relay/README.md).
