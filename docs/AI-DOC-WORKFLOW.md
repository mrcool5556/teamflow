# AI + docs workflow

Use Teamflow as the **action layer** on top of large markdown doc trees (e.g. `D:\projects\3dfriend\docs`). Docs stay the deep reference; Teamflow holds **what needs doing**, **who owns it**, and **where it lives**.

## Mental model

| Teamflow | Doc repo role |
|----------|----------------|
| **Team** | Product / repo (`3dfriend`, `teamflow`, `JamatarsServer`) |
| **Project** (optional) | Doc area or subsystem (`VRMA`, `Buddy UI`, `World Engine`) |
| **Row** | Track or lane (`Active`, `Overnight-safe`, `Ideas`, `Blocked`) |
| **Column** | State (`Backlog` → `Todo` → `In Progress` → `Done`) |
| **Card** | One actionable item extracted from a doc |
| **Description** | Link + excerpt from source doc |
| **Assignee** | Human owner (AI pulls `assigneeId = me`) |
| **Row assignee** | Lane owner (e.g. whole "Unreal migration" track) |

Docs are not replaced. Each card should point back:

```markdown
Source: docs/NEXT_WORK.md § "Animated Live Folder Sorter"
Status in doc: 🔲 not started

Acceptance:
- live_sort_folder action streams one file at a time
- speech + gesture per file
```

## Example: 3dfriend

Suggested board layout:

| Row | Use for |
|-----|---------|
| **Active** | Current sprint / handoff items from `NEXT_WORK.md` |
| **Overnight-safe** | Docs-only, tooling, checklists (no renderer touches) |
| **Roadmap** | Items from `ROADMAP.md` not started yet |
| **Ideas** | `IDEAS.md`, speculative work |

Columns stay default. Color rows by area (orange = UI, cyan = agent, purple = Unreal).

## How AI reads work

With MCP configured (`docs/MCP.md`), the assistant can:

| Goal | Tool |
|------|------|
| My tasks | `get_my_work` with `teamId` |
| Tasks in a lane | `list_issues` with `rowId` or `rowName` |
| Search docs-backed items | `list_issues` with `search` |
| Board overview | `get_board_summary` |
| Who is on the team | `list_team_members` |
| Row structure | `list_rows` |

## How humans use the UI

- Drag cards between columns/rows (hold 0.5s to drag).
- Assign yourself or a teammate on card or row.
- Timer on card for focused work sessions.
- Row colors for quick visual scanning.

## Sync strategy (recommended)

1. **One-time import** — Break `NEXT_WORK.md` / `ROADMAP.md` sections into cards (script or manual).
2. **Ongoing** — When AI or you finish something:
   - Mark card Done in Teamflow.
   - Optionally update the source doc checkbox (separate commit).
3. **Do not** auto-sync every doc edit — docs are narrative; Teamflow is the queue.

## Description convention

Use this in card descriptions so AI can jump to source:

```
source: docs/NEXT_WORK.md
section: "Animated Live Folder Sorter"
repo: D:/projects/3dfriend
```

## CLI quick reference

```powershell
teamflow issues list --team <uuid> --assignee me
teamflow issues list --team <uuid> --row <row-uuid>
teamflow board summary --team <uuid>
```

## Next improvements (optional)

- Labels per doc file (`doc:next-work`, `area:vrma`)
- Import script: markdown headings → issues
- Web link from card to `file://` or GitHub path
- MCP resource for full issue description without loading entire board
