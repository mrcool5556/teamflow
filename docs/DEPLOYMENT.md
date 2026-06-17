# Deployment index

Two first-class setups. **Docker not required.**

| Setup | Path | Doc |
|-------|------|-----|
| **A — Windows self-host** | [deploy/windows/](../deploy/windows/) | [steps/07-windows-deploy.md](steps/07-windows-deploy.md) |
| **B — Proxmox LXC** | [deploy/proxmox-lxc/](../deploy/proxmox-lxc/) | [steps/08-proxmox-lxc-deploy.md](steps/08-proxmox-lxc-deploy.md) |
| **Relay** (remote access to B) | [deploy/relay/](../deploy/relay/) | [steps/09-relay.md](steps/09-relay.md) |

Direct Teamflow container connection details are in [CONNECTIONS.md](CONNECTIONS.md).

## Local development

```powershell
pnpm db:setup
pnpm dev
```

- Web dev: http://localhost:5173 (Vite proxies `/api`)
- API: http://localhost:3000

## Production (single port)

Build web + server; server serves `apps/web/dist`:

```powershell
pnpm build
node apps/server/dist/index.js
```

Open http://localhost:3000
