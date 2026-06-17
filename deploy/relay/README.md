# Relay / remote access

Connect your **Windows PC** (Cursor, browser, CLI) to Teamflow on **Proxmox LXC**.

**Important:** MCP runs locally on Windows. Only the **HTTP API URL** must be reachable remotely.

## Option A — Tailscale (recommended)

1. Install Tailscale on Proxmox LXC and on Windows
2. Enable MagicDNS in Tailscale admin
3. API URL: `http://teamflow:3000` (hostname = LXC hostname)

**Cursor MCP env:**
```json
"TEAMFLOW_URL": "http://teamflow:3000"
```

**CLI:**
```powershell
teamflow login --url http://teamflow:3000 --email you@example.com --password ...
```

Pros: private, no port forwarding. Cons: Tailscale on each device.

## Option B — Reverse proxy + TLS

On the LXC (or a small relay CT):

```bash
apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```
tasks.yourdomain.com {
  reverse_proxy localhost:3000
}
```

Use `TEAMFLOW_URL=https://tasks.yourdomain.com`

## Option C — Dedicated relay LXC

Small CT (512 MB) running only Caddy or `cloudflared`:

```
Internet → relay CT (443) → 192.168.x.x:3000 (teamflow LXC)
```

Useful when the app LXC has no inbound routes.

## Firewall checklist

- LXC: allow 3000 on LAN only, or 443 on relay CT only
- Do not expose Postgres (5432) publicly

## What you handle

Per project plan, **you** set up the Proxmox relay. Document your chosen URL in `.env` / MCP config.

See [docs/steps/09-relay.md](../../docs/steps/09-relay.md)
