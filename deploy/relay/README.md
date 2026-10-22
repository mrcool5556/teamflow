# Relay / remote access

Reach Teamflow on the **Proxmox LXC** from your Windows PC (browser, MCP, CLI) and from teammates' browsers.

**MCP runs locally** on your PC. Only the HTTP API URL must be reachable remotely.

## Option A — Tailscale (recommended for you alone)

1. Install Tailscale on the LXC and on Windows
2. Enable MagicDNS in the Tailscale admin
3. API URL: `http://teamflow:3000` (hostname = LXC hostname)

MCP env:

```json
"TEAMFLOW_URL": "http://teamflow:3000"
```

CLI:

```powershell
teamflow login --url http://teamflow:3000 --token pat_...
```

If you also open the web UI on that name, set `PUBLIC_URL=http://teamflow:3000` (or add it to `CORS_ORIGINS`) so the browser origin is allowed.

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

Then in `/opt/teamflow/.env`:

```env
PUBLIC_URL=https://tasks.yourdomain.com
TEAMFLOW_TRUST_PROXY=1
```

and `systemctl restart teamflow`. MCP / CLI use `TEAMFLOW_URL=https://tasks.yourdomain.com`.

`TEAMFLOW_TRUST_PROXY=1` makes login rate limiting use `X-Forwarded-For`; set it only when every request comes through the proxy.

## Option C — Dedicated relay LXC

Small CT (512 MB) running only Caddy or `cloudflared`:

```
Internet → relay CT (443) → 192.168.x.x:3000 (teamflow LXC)
```

Useful when the app LXC has no inbound routes. Same `.env` settings as option B. Cloudflare's proxy limits request size (about 100 MB on free plans); chunked uploads stay under it, see [docs/LARGE-FILES.md](../../docs/LARGE-FILES.md#production-checklist).

## Firewall checklist

- LXC: allow 3000 on the LAN only, or 443 on the relay CT only
- Do not expose port 3000 directly to the internet without TLS

## Your choice

You set up the relay. Record the chosen URL in `PUBLIC_URL` (server) and `TEAMFLOW_URL` (MCP, CLI, Discord bot).

See [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#remote-access).
