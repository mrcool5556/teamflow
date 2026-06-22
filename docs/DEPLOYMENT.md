# Deployment index

**Start here for production:** [SELF-HOSTING.md](SELF-HOSTING.md)

| Setup | Path | Guide section |
|-------|------|---------------|
| **Windows** | [deploy/windows/](../deploy/windows/) | [Self-hosting → Windows](SELF-HOSTING.md#windows) |
| **Proxmox LXC** | [deploy/proxmox-lxc/](../deploy/proxmox-lxc/) | [Self-hosting → LXC](SELF-HOSTING.md#proxmox-lxc) |
| **Docker** | [deploy/docker/](../deploy/docker/) | [Self-hosting → Docker](SELF-HOSTING.md#docker) |
| **Relay** (remote HTTPS) | [deploy/relay/](../deploy/relay/) | [Self-hosting → Remote access](SELF-HOSTING.md#remote-access) |

## Local development

```powershell
pnpm db:setup
pnpm dev
```

- Web dev: http://localhost:5173 (Vite proxies `/api`)
- API: http://localhost:3000

## Production (single port, no Docker)

Build web + server; server serves `apps/web/dist`:

```powershell
pnpm build
$env:SERVE_WEB = "true"
node apps/server/dist/index.js
```

Open http://localhost:3000
