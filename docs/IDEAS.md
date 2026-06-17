# Teamflow — Ideas backlog

**How to use this file:** When we're mid-task and someone says **"Idea:"**, capture it here instead of building it immediately. Pick items from this list after the current focus ships.

**In-app view:** Open **Plan** in the top bar to see this backlog as a dashboard (synced from `apps/web/src/data/roadmap.ts`).

**Last updated:** 2026-06-17

---

## Current focus (do first)

| Priority | Item | Notes |
|----------|------|-------|
| 1 | Windows deploy validation | Smoke-test `install.ps1` + single-port production |
| 2 | Team invites | Join existing team, not isolated workspace per register |
| 3 | Discord bot integration | See below — commands, ticket → issue, setup docs |

---

## Ideas — build after current focus

### Accounts, teams, projects & switching PCs

**Already works today:**

| Piece | Status |
|-------|--------|
| User accounts | Register / login (`email` + password), JWT stored in browser |
| Board data | Lives in the **server database** (SQLite), not in the browser |
| Same account, new PC | Point browser at the **same server URL**, log in — you see the same team/board |
| Team switcher | Header dropdown when user belongs to **multiple teams** |
| Profile prefs | Settings → export/import JSON (column width, UI prefs — **not** issues) |

**Gap today:** Each new registration creates a **new isolated team**. Invites (priority #2) fix “join my teammate’s board.”

**Projects:** `projects` table + API exist (`GET/POST /projects`), but **no board UI to create/switch projects** yet. Issues can be tied to `project_id`; v1 UI would be a header switcher like teams.

**Recommended path for “save project, use on new PC”:**

1. **Self-host one Teamflow instance** (Windows `install.ps1` or Proxmox LXC) — single URL for the household/team.
2. Everyone **registers once** (or joins via invite when built).
3. On a new PC: open that URL, **log in** — done. Optional: MCP/CLI PAT for Cursor on the new machine.
4. **Back up** the server’s SQLite file (`teamflow.db`) on a schedule — that *is* the project.

**Not recommended:** Treating local `pnpm dev` on one laptop as the source of truth — data stays on that machine unless you copy the DB.

**Later:** optional cloud-hosted Teamflow, org/workspace layer above teams, project archive/export bundle.

---

### Per-profile image

- Upload or URL for user avatar (replaces initials circles on cards, comments, assignee picker)
- Store: `users.avatar_url` or file in attachments store; serve via API
- Settings → profile photo crop/upload

---

### Switch between projects

- Header switcher: Team → Project → Board (or Team + Project dropdowns)
- `GET/POST /projects` already on API; wire web UI, filter `listIssues` by `projectId`
- Default project per team for new issues

---

### Discord bot integration

**Goal:** Talk to Teamflow from Discord — create/query issues, pull from a ticket thread, share links back.

**Possible v1:**

| Feature | Behavior |
|---------|----------|
| Slash commands | `/issue ENG-42`, `/create`, `/link` with share URL |
| Ticket → issue | Bot watches a channel/thread, creates issue from first message + link |
| Post back | Reply with `?ref=ENG-42` link when issue created/updated |
| Auth | Bot token + Teamflow PAT per server; map Discord guild → team |

**Deliverables:**

- `apps/discord-bot` or `packages/discord-bot` service
- Env: `DISCORD_BOT_TOKEN`, `TEAMFLOW_API_URL`, `TEAMFLOW_PAT`
- **Setup doc:** invite URL, required permissions (Read Messages, Send Messages, Use Slash Commands), how to bind guild to team ID

**Later:** assign from Discord, bulk status, webhook events Discord → announcements channel

---

### Invites & members

- Invite link / code → join existing team
- Members list in Settings
- Optional invite-only registration (disable open signup)

---

### File attachments

- Upload on issue (v1) and row (v2)
- **Images in comments & description** — paste or attach; inline preview in drawer; store on server keyed to issue/comment
- Soft delete + 7-day recovery bin + permanent delete
- Files keyed by immutable entity ID (survives moves; trash on parent delete)

---

### Server-backed activity

- `GET /teams/:teamId/activity`
- Recent panel survives refresh
- Log row/column deletes

---

### Phase 2 (from overview)

- Search / saved views (global; board has per-row/column search)
- Outbound webhooks (use reference IDs)
- Labels UI
- Projects UI
- "My work" view
- Markdown import (headings → issues)
- Row max height slider in Settings
- Editable team name

---

### Settings — UI style & theming (beyond presets)

- **Window / chrome style** — move past hard industrial only: optional softer or rounded layout packs
- **Rounded corners** — toggle or slider (cards, panels, inputs, drawer)
- **UI colors** — surface, border, accent, panel (not just preset names)
- **Text colors** — primary, muted, link, heading
- Live preview in Settings (same pattern as theme + column width today)
- Export/import with profile JSON

---

### Row & column colors

- **Row color** — already in Row **Edit** menu (tints row separator + column header row)
- **Column header color** — per-column override (not just status type colors)
- UX options: small **column settings** control in header, or color picker when renaming
- Stored on `issue_statuses` (e.g. `header_color`); applies across all rows that share that column definition per row

---

### Linear → Teamflow migration

**Done:** `scripts/import-from-linear.mjs` + `scripts/linear-export.json` — 76 AxiomRP issues → Custom Scripts row (idempotent, `[AXI-*]` titles, status/priority mapped).

**Still open:**

- Import Linear **comments**
- **Sub-issues** — `parentId` on issues, drawer section, hide from board (one level, Linear-style)
- **Backfill parent links** from `Parent: AXI-*` in imported descriptions
- **Team invites** + real assignee mapping (imports used Demo User only)
- Optional **dedicated AxiomRP row** instead of Custom Scripts

---

### Sub-issues (Linear-style)

- Nullable `parentId` on issues
- Sub-issues section in issue drawer (+ Add sub-issue / Set parent)
- Hide sub-issues from main board by default
- One level deep (no nested grandchildren)

---

## Shipped (for reference)

| Date | Item |
|------|------|
| 2026-06 | Kanban: per-row columns, drag, assignees, timers, row colors |
| 2026-06 | Settings + live preview + profile sync |
| 2026-06 | Undo toast + change history panel |
| 2026-06 | Issue drawer: edit, comments, status, priority, due, timer |
| 2026-06 | Immutable refs: `ENG-*`, `row_*`, `col_*`, resolve API, copy buttons |
| 2026-06 | Ref links in text + share URLs + `?ref=` deep links |
| 2026-06 | Row/column search, multi-assignees, row Edit menu |
| 2026-06 | Column scroll cap (`--board-row-max-height`) |
| 2026-06 | Multi-select bulk edit (Ctrl/Shift click, bulk toolbar) |
| 2026-06 | Issue drawer polish: description rich text, clickable links, shorten URL, comments, 7-day restore, drawer scroll |
| 2026-06 | Column drag-reorder; Linear import script; delete immediate + restore |
