export type RoadmapStatus = "done" | "focus" | "planned" | "gap" | "partial";

export type RoadmapItem = {
  id: string;
  title: string;
  notes?: string;
  status: RoadmapStatus;
  priority?: number;
  tags?: string[];
};

export type RoadmapCheck = {
  id: string;
  label: string;
  status: RoadmapStatus;
  note?: string;
};

export type RoadmapIdeaGroup = {
  id: string;
  title: string;
  summary?: string;
  items: RoadmapItem[];
};

export const ROADMAP_META = {
  title: "Teamflow plan",
  updated: "2026-06-17",
  tagline: "What ships next, what already works, and what’s on the backlog.",
};

export const ROADMAP_FOCUS: RoadmapItem[] = [
  {
    id: "deploy",
    title: "Windows deploy validation",
    notes: "Smoke-test install.ps1 + single-port production on a real machine.",
    status: "done",
    priority: 1,
    tags: ["deploy", "ops"],
  },
  {
    id: "invites",
    title: "Team invites",
    notes: "Join an existing team instead of every register creating an isolated workspace.",
    status: "focus",
    priority: 2,
    tags: ["accounts", "teams"],
  },
  {
    id: "discord",
    title: "Discord bot integration",
    notes: "Slash commands, ticket → issue, post back ref links. See ideas for v1 scope.",
    status: "focus",
    priority: 3,
    tags: ["integrations"],
  },
];

export const ROADMAP_POLISH: RoadmapItem[] = [
  {
    id: "column-header",
    title: "Column header size jump on first card",
    notes: "Empty-column remove button caused layout shift — reserved slot added.",
    status: "done",
    tags: ["ui", "board"],
  },
  {
    id: "drawer-scroll",
    title: "Issue drawer scroll to Post comment",
    notes: "Drawer body scrolls; header stays fixed.",
    status: "done",
    tags: ["ui", "drawer"],
  },
  {
    id: "clickable-links",
    title: "Clickable URLs in comments & description",
    notes: "Paste-to-shorten banner; raw URLs link automatically when posted.",
    status: "done",
    tags: ["rich-text"],
  },
  {
    id: "bulk-restore",
    title: "Bulk delete → 7-day restore",
    notes: "Single-issue restore works; bulk deletes in history cannot restore yet.",
    status: "gap",
    tags: ["history"],
  },
  {
    id: "timer-ui",
    title: "Timer UI redesign",
    notes: "Timer works; layout/visual polish still wanted.",
    status: "planned",
    tags: ["ui", "timer"],
  },
  {
    id: "api-reload",
    title: "API hot-reload on Windows",
    notes: "tsx watch hung; dev uses plain tsx — manual API restart after server edits.",
    status: "gap",
    tags: ["dev"],
  },
  {
    id: "column-drag",
    title: "Column drag-reorder (⋮⋮ on headers)",
    notes: "PATCH status position; horizontal drag; header + cards move together.",
    status: "done",
    tags: ["board"],
  },
  {
    id: "delete-immediate",
    title: "Delete commits to API immediately",
    notes: "Undo calls restore; fixes card reappearing on refresh during undo window.",
    status: "done",
    tags: ["history"],
  },
];

export const ROADMAP_ACCOUNTS: RoadmapCheck[] = [
  {
    id: "register-login",
    label: "User accounts (register / login)",
    status: "done",
    note: "JWT in browser; data on server.",
  },
  {
    id: "server-db",
    label: "Board data on server (SQLite)",
    status: "done",
    note: "Not stored in the browser.",
  },
  {
    id: "new-pc-login",
    label: "Same account on a new PC",
    status: "partial",
    note: "Works when you use the same hosted URL + login. Local pnpm dev is per-machine.",
  },
  {
    id: "team-switch",
    label: "Team switcher in header",
    status: "partial",
    note: "Shows when user belongs to multiple teams.",
  },
  {
    id: "invites-gap",
    label: "Join teammate’s team",
    status: "gap",
    note: "Each register still creates a new solo team until invites ship.",
  },
  {
    id: "projects-api",
    label: "Projects API",
    status: "done",
    note: "GET/POST /projects exists.",
  },
  {
    id: "projects-ui",
    label: "Switch projects in UI",
    status: "gap",
    note: "No header switcher or board filter yet.",
  },
  {
    id: "profile-export",
    label: "Profile export/import",
    status: "done",
    note: "UI prefs only — not issues or board data.",
  },
  {
    id: "db-backup",
    label: "Back up teamflow.db",
    status: "planned",
    note: "That file is the project; schedule backups on your server.",
  },
  {
    id: "avatar",
    label: "Per-profile image",
    status: "planned",
    note: "Initials today; upload/URL avatar on backlog.",
  },
];

export const ROADMAP_IDEAS: RoadmapIdeaGroup[] = [
  {
    id: "discord",
    title: "Discord bot",
    summary: "Talk to Teamflow from Discord — create/query issues, ticket threads, ref links back.",
    items: [
      { id: "d-slash", title: "Slash commands (/issue, /create, /link)", status: "planned" },
      { id: "d-ticket", title: "Ticket thread → issue", status: "planned" },
      { id: "d-postback", title: "Post ?ref= links on create/update", status: "planned" },
      { id: "d-auth", title: "Bot token + PAT per guild → team mapping", status: "planned" },
    ],
  },
  {
    id: "members",
    title: "Invites & members",
    items: [
      { id: "m-invite", title: "Invite link / code → join team", status: "planned" },
      { id: "m-list", title: "Members list in Settings", status: "planned" },
      { id: "m-invite-only", title: "Optional invite-only registration", status: "planned" },
    ],
  },
  {
    id: "attachments",
    title: "File attachments",
    items: [
      { id: "a-issue", title: "Upload on issue (v1)", status: "planned" },
      { id: "a-comment-img", title: "Attach / paste images in comments", status: "planned" },
      { id: "a-desc-img", title: "Attach / paste images in description", status: "planned" },
      { id: "a-row", title: "Upload on row (v2)", status: "planned" },
      { id: "a-trash", title: "Soft delete + 7-day bin + permanent delete", status: "planned" },
    ],
  },
  {
    id: "activity",
    title: "Server-backed activity",
    items: [
      { id: "act-api", title: "GET /teams/:teamId/activity", status: "planned" },
      { id: "act-panel", title: "Recent panel survives refresh", status: "planned" },
      { id: "act-log", title: "Log row/column deletes", status: "planned" },
    ],
  },
  {
    id: "phase2",
    title: "Phase 2",
    items: [
      { id: "p2-search", title: "Global search / saved views", status: "planned" },
      { id: "p2-webhooks", title: "Outbound webhooks", status: "planned" },
      { id: "p2-labels", title: "Labels UI", status: "planned" },
      { id: "p2-mywork", title: "\"My work\" view", status: "planned" },
      { id: "p2-import", title: "Markdown import (headings → issues)", status: "planned" },
      { id: "p2-row-height", title: "Row max height slider in Settings", status: "planned" },
      { id: "p2-team-name", title: "Editable team name", status: "planned" },
    ],
  },
  {
    id: "ui-style",
    title: "Settings — UI style & theming",
    summary: "Beyond dark/light and color presets: rounded corners, custom UI/text colors, softer window chrome.",
    items: [
      { id: "ui-chrome", title: "Window / layout style packs (not only hard industrial)", status: "planned" },
      { id: "ui-radius", title: "Rounded corners toggle or level", status: "planned" },
      { id: "ui-colors", title: "Custom UI colors (surface, border, accent, panel)", status: "planned" },
      { id: "ui-text", title: "Custom text colors (primary, muted, links)", status: "planned" },
      { id: "ui-preview", title: "Live preview in Settings for all of the above", status: "planned" },
    ],
  },
  {
    id: "board-colors",
    title: "Row & column colors",
    summary: "Row color exists in Edit menu; column header color per status still to build.",
    items: [
      { id: "bc-row", title: "Row color (Row Edit menu)", status: "done" },
      { id: "bc-col-header", title: "Per-column header background/color override", status: "planned" },
      { id: "bc-col-ux", title: "Column settings in header or rename flow", status: "planned" },
    ],
  },
  {
    id: "linear-migration",
    title: "Linear → Teamflow migration",
    summary: "76 AxiomRP issues imported to Custom Scripts row via scripts/import-from-linear.mjs (idempotent).",
    items: [
      { id: "lm-import", title: "Import script + linear-export.json snapshot", status: "done" },
      { id: "lm-comments", title: "Import Linear comments", status: "planned" },
      { id: "lm-parent-backfill", title: "Backfill parent links from Parent: AXI-* metadata", status: "planned" },
      { id: "lm-assignees", title: "Invite team + map real assignees (not Demo User only)", status: "planned" },
      { id: "lm-axiom-row", title: "Dedicated AxiomRP row (vs Custom Scripts)", status: "planned" },
      { id: "lm-subissues", title: "Sub-issues: parentId, drawer UI, hidden from board", status: "planned" },
    ],
  },
];

export const ROADMAP_SHIPPED: { date: string; title: string }[] = [
  { date: "2026-06", title: "Kanban: per-row columns, drag, assignees, timers, row colors" },
  { date: "2026-06", title: "Settings + live preview + profile sync" },
  { date: "2026-06", title: "Undo toast + change history panel" },
  { date: "2026-06", title: "Issue drawer: edit, comments, status, priority, due, timer" },
  { date: "2026-06", title: "Immutable refs (ENG-*, row_*, col_*), resolve API, copy buttons" },
  { date: "2026-06", title: "Ref links in text + share URLs + ?ref= deep links" },
  { date: "2026-06", title: "Row/column search, multi-assignees, row Edit menu" },
  { date: "2026-06", title: "Column scroll cap (--board-row-max-height)" },
  { date: "2026-06", title: "Multi-select bulk edit (Ctrl/Shift, bulk toolbar)" },
  { date: "2026-06", title: "Drawer polish: rich description, links, shorten URL, 7-day restore, scroll" },
  { date: "2026-06", title: "Column header layout stability on first card" },
  { date: "2026-06", title: "Column drag-reorder (⋮⋮ grip on column headers)" },
  { date: "2026-06", title: "Delete: immediate API soft-delete + undo restore" },
  { date: "2026-06", title: "Linear import script (76 AxiomRP → Custom Scripts row)" },
  { date: "2026-06", title: "Plan view + global Cursor MCP (teamflow)" },
];

export const ROADMAP_DEPLOY_STEPS = [
  { step: "Now", label: "Local dev", detail: "pnpm dev — data stays on this machine" },
  { step: "Next", label: "Windows install.ps1 or Proxmox LXC", detail: "One URL for the team" },
  { step: "Then", label: "Relay (optional)", detail: "Remote access to your server" },
  { step: "Always", label: "Backup teamflow.db", detail: "That file is your project" },
];

export function countByStatus(items: { status: RoadmapStatus }[], status: RoadmapStatus) {
  return items.filter((item) => item.status === status).length;
}
