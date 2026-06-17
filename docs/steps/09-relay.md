# Step 09 — Relay / remote access

## Goal

Reach Teamflow on Proxmox LXC from your Windows PC (browser, CLI, MCP).

## Status: documented (you implement on Proxmox)

MCP stays on Windows. Only `TEAMFLOW_URL` changes.

## Options

| Option | Doc section | Best for |
|--------|-------------|----------|
| Tailscale | [deploy/relay/README.md](../../deploy/relay/README.md) | Private, simple |
| Caddy TLS | same | Public URL |
| Relay LXC | same | Separate hop |

## After relay is up

1. Confirm `curl http://<your-url>/health` from Windows
2. Update Cursor MCP `TEAMFLOW_URL`
3. `teamflow login --url <your-url> ...`

## Verify

- [ ] Health check works from Windows
- [ ] Web UI loads from Windows browser
- [ ] MCP `list_issues` works with PAT
- [ ] CLI `teamflow issues list` works

## Your action

Set up relay on Proxmox when ready. Record your URL here:

```
TEAMFLOW_PROD_URL=
```

## Phase 1 complete

When steps 01–09 are verified, move to Phase 2 (search, webhooks, Postgres prod driver).
