# Build Status

**Last updated:** 2026-06-16  
**Current phase:** 1 — Foundation (walkthrough in progress)

## Summary

| Area | Status |
|------|--------|
| Steps 00–06 (app) | done |
| Step 07 Windows deploy | done (scripts) |
| Step 08 Proxmox LXC | done (scripts + docs) |
| Step 09 Relay | documented (you implement) |

## Step tracker

| Step | Doc | Status | Your action |
|------|-----|--------|-------------|
| 00 | [00-overview.md](steps/00-overview.md) | done | Read phase map |
| 01 | [01-scaffold.md](steps/01-scaffold.md) | done | `pnpm -r build` |
| 02 | [02-database.md](steps/02-database.md) | done | `pnpm db:setup` |
| 03 | [03-api.md](steps/03-api.md) | done | :3000/health |
| 04 | [04-web.md](steps/04-web.md) | done | `pnpm dev` → :5173 |
| 05 | [05-mcp.md](steps/05-mcp.md) | done | Create PAT + Cursor config |
| 06 | [06-cli.md](steps/06-cli.md) | done | `teamflow login` |
| 07 | [07-windows-deploy.md](steps/07-windows-deploy.md) | done | `.\deploy\windows\install.ps1` |
| 08 | [08-proxmox-lxc-deploy.md](steps/08-proxmox-lxc-deploy.md) | ready | When moving to LXC |
| 09 | [09-relay.md](steps/09-relay.md) | ready | Your Proxmox relay |

## Next action for you

**Right now:** run Step 04 + 05 locally (web + MCP)  
**When ready:** Step 08 on Proxmox, then Step 09 relay  
**Deferred ideas:** [IDEAS.md](IDEAS.md) — say "Idea:" in chat to add without switching tasks

## Changelog

| Date | Change |
|------|--------|
| 2026-06-16 | Steps 07–09 deploy scripts and docs added |
