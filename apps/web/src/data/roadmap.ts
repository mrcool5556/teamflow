export type RoadmapStatus = "done" | "focus" | "planned" | "gap" | "partial";

export type RoadmapItem = {
  id: string;
  title: string;
  status: RoadmapStatus;
  priority?: number;
  notes?: string;
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

type DeployStep = {
  step: string;
  label: string;
  detail: string;
};

type ShippedItem = {
  date: string;
  title: string;
};

export const ROADMAP_META = {
  title: "Teamflow plan",
  updated: "2026-06-17",
  tagline: "What ships next, what already works, and what is on the backlog.",
};

export const ROADMAP_FOCUS: RoadmapItem[] = [
  {
    id: "large-files",
    title: "Large files — chunked upload & seekable video",
    notes: "4 GB video/ZIP, resumable chunks, HTTP Range streaming. See docs/LARGE-FILES.md.",
    status: "focus",
    priority: 1,
    tags: ["files", "video"],
  },
  {
    id: "deploy",
    title: "Self-hosted deploy (Windows / LXC / Docker)",
    notes: "SELF-HOSTING.md, update command, SMTP wizard. Production at teamflow.toasterland.org.",
    status: "done",
    priority: 2,
    tags: ["deploy", "ops"],
  },
  {
    id: "invites",
    title: "Team invites",
    notes: "Join an existing team instead of every register creating an isolated workspace.",
    status: "done",
    priority: 2,
    tags: ["accounts", "teams"],
  },
  {
    id: "discord",
    title: "Discord bot integration",
    notes: "Slash commands, ticket threads, share links. See docs/discord-bot.md.",
    status: "done",
    priority: 3,
    tags: ["integrations"],
  },
];

/** Suggested build order for filesystem / attachments work. */
export const ROADMAP_FILESYSTEM_ORDER: RoadmapItem[] = [
  {
    id: "fs-link-row",
    title: "Link row file to issue",
    status: "done",
    priority: 1,
    notes: "Picker in issue drawer Attachments; links by fileId without re-uploading.",
    tags: ["files"],
  },
  {
    id: "fs-move",
    title: "Move attachment between issues",
    status: "partial",
    priority: 2,
    notes: "Server move API exists; needs api-client methods and drawer UI.",
    tags: ["files"],
  },
  {
    id: "fs-paste-comment",
    title: "Paste images in comments",
    status: "planned",
    priority: 3,
    notes: "Attach from clipboard when posting a comment.",
    tags: ["files", "rich-text"],
  },
  {
    id: "fs-trash",
    title: "File soft-delete bin (7-day)",
    status: "planned",
    priority: 4,
    notes: "Recover removed files; permanent delete after retention.",
    tags: ["files"],
  },
  {
    id: "fs-chunk-ux",
    title: "Resume / cancel chunked uploads",
    status: "partial",
    priority: 5,
    notes: "api-client supports resumeSessionId and abort; wire into upload UI.",
    tags: ["files", "video"],
  },
  {
    id: "fs-row-badge",
    title: "File count badge on row Files button",
    status: "planned",
    priority: 6,
    notes: "Show how many shared files live on each row without opening the drawer.",
    tags: ["files", "ui"],
  },
  {
    id: "fs-cross-links",
    title: "Cross-link indicators on files",
    status: "planned",
    priority: 7,
    notes: "Show when a file is also linked on row X or issue Y.",
    tags: ["files", "ui"],
  },
  {
    id: "fs-team-area",
    title: "Team-wide file area",
    status: "planned",
    priority: 8,
    notes: "Shared files at team scope, not only per issue or row.",
    tags: ["files"],
  },
  {
    id: "fs-folders",
    title: "Folders / directory tree",
    status: "planned",
    priority: 9,
    notes: "Organize uploads into folders instead of flat lists.",
    tags: ["files"],
  },
];

export const ROADMAP_POLISH: RoadmapItem[] = [
  {
    id: "column-header",
    title: "Column header size jump on first card",
    notes: "Empty-column remove button caused layout shift; reserved slot added.",
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
    title: "Clickable URLs in comments and description",
    notes: "Paste-to-shorten banner; raw URLs link automatically when posted.",
    status: "done",
    tags: ["rich-text"],
  },
  {
    id: "bulk-restore",
    title: "Bulk delete to 7-day restore",
    notes: "Single-issue restore works; bulk deletes in history cannot restore yet.",
    status: "gap",
    tags: ["history"],
  },
  {
    id: "timer-ui",
    title: "Timer UI redesign",
    notes: "Timer works; layout and visual polish still wanted.",
    status: "planned",
    tags: ["ui", "timer"],
  },
  {
    id: "api-reload",
    title: "API hot-reload on Windows",
    notes: "tsx watch hung; dev uses plain tsx, so restart the API manually after server edits.",
    status: "gap",
    tags: ["dev"],
  },
  {
    id: "column-drag",
    title: "Column drag-reorder",
    notes: "PATCH status position; horizontal drag; header and cards move together.",
    status: "done",
    tags: ["board"],
  },
  {
    id: "delete-immediate",
    title: "Delete commits to API immediately",
    notes: "Undo calls restore; fixes card reappearing on refresh during the undo window.",
    status: "done",
    tags: ["history"],
  },
  {
    id: "undo-toast-import",
    title: "Undo toast import",
    status: "done",
    notes: "The app renders the existing UndoToast component for pending delete recovery.",
    tags: ["build"],
  },
  {
    id: "roadmap-data",
    title: "Roadmap data source",
    status: "done",
    notes: "RoadmapPanel has typed local data for production builds.",
    tags: ["build", "ui"],
  },
  {
    id: "service-docs",
    title: "Service install polish",
    status: "gap",
    notes: "NSSM remains optional and must be installed separately before service registration.",
    tags: ["ops"],
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
    note: "Works when you use the same hosted URL and login. Local pnpm dev is per-machine.",
  },
  {
    id: "team-switch",
    label: "Team switcher in header",
    status: "done",
    note: "Workspace dropdown when you belong to multiple teams.",
  },
  {
    id: "invites-gap",
    label: "Join teammate's team",
    status: "done",
    note: "Invite links, members list, and join-by-paste in Settings.",
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
    note: "UI prefs only; not issues or board data.",
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
    summary: "Talk to Teamflow from Discord: create/query issues, ticket threads, and ref links back.",
    items: [
      { id: "d-slash", title: "Slash commands (/issue, /create, /link)", status: "done" },
      { id: "d-ticket", title: "Ticket thread to issue", status: "done" },
      { id: "d-postback", title: "Post ?ref= links on create/update", status: "done" },
      {
        id: "d-auth",
        title: "Per-team guild link, roles, and tickets in Settings",
        status: "done",
        notes: "One bot + .env token/PAT; each team links its own Discord server.",
      },
      {
        id: "d-secrets",
        title: "Bot credentials in Settings (encrypted)",
        status: "done",
        notes: "TEAMFLOW_BOT_CONFIG_KEY + Settings → Bot credentials; .env fallback remains.",
      },
    ],
  },
  {
    id: "members",
    title: "Invites and members",
    items: [
      { id: "m-invite", title: "Invite link / code to join team", status: "done" },
      { id: "m-list", title: "Members list in Settings", status: "done" },
      {
        id: "m-invite-only",
        title: "Optional invite-only registration",
        status: "partial",
        notes: "Set TEAMFLOW_INVITE_ONLY=true on the server.",
      },
    ],
  },
  {
    id: "attachments",
    title: "File attachments",
    summary: "Issue + row uploads today. See Filesystem build order for what ships next.",
    items: [
      { id: "a-issue", title: "Upload on issue (v1)", status: "done" },
      { id: "a-row", title: "Upload on row (shared files drawer)", status: "done" },
      {
        id: "a-chunk",
        title: "Chunked upload and seekable video (server)",
        status: "done",
        notes: "UI resume/cancel still in filesystem order.",
      },
      {
        id: "a-link-row",
        title: "Link row file to issue",
        status: "done",
        notes: "Issue drawer → Attachments → link from row shared files.",
      },
      {
        id: "a-move",
        title: "Move attachment between issues",
        status: "partial",
        notes: "Server API only today.",
      },
      { id: "a-comment-img", title: "Attach / paste images in comments", status: "planned" },
      { id: "a-desc-img", title: "Attach / paste images in description", status: "planned" },
      { id: "a-trash", title: "Soft delete plus 7-day bin plus permanent delete", status: "planned" },
      {
        id: "a-row-badge",
        title: "File count badge on row Files button",
        status: "planned",
      },
      {
        id: "a-cross-links",
        title: "Cross-link indicators (also on row X / issue Y)",
        status: "planned",
      },
      { id: "a-team", title: "Team-wide file area", status: "planned" },
      { id: "a-folders", title: "Folders / directory tree", status: "planned" },
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
      { id: "p2-import", title: "Markdown import (headings to issues)", status: "planned" },
      { id: "p2-row-height", title: "Row max height slider in Settings", status: "planned" },
      { id: "p2-team-name", title: "Editable team name", status: "planned" },
    ],
  },
  {
    id: "ui-style",
    title: "Settings: UI style and theming",
    summary: "Beyond dark/light and color presets: rounded corners, custom UI/text colors, softer window chrome.",
    items: [
      { id: "ui-chrome", title: "Window / layout style packs", status: "planned" },
      { id: "ui-radius", title: "Rounded corners toggle or level", status: "planned" },
      { id: "ui-colors", title: "Custom UI colors (surface, border, accent, panel)", status: "planned" },
      { id: "ui-text", title: "Custom text colors (primary, muted, links)", status: "planned" },
      { id: "ui-preview", title: "Live preview in Settings for all of the above", status: "planned" },
    ],
  },
  {
    id: "board-colors",
    title: "Row and column colors",
    summary: "Row color exists in Edit menu; column header color per status still to build.",
    items: [
      { id: "bc-row", title: "Row color (Row Edit menu)", status: "done" },
      { id: "bc-col-header", title: "Per-column header background/color override", status: "planned" },
      { id: "bc-col-ux", title: "Column settings in header or rename flow", status: "planned" },
    ],
  },
  {
    id: "linear-migration",
    title: "Linear to Teamflow migration",
    summary: "76 AxiomRP issues imported to Custom Scripts row via scripts/import-from-linear.mjs (idempotent).",
    items: [
      { id: "lm-import", title: "Import script plus linear-export.json snapshot", status: "done" },
      { id: "lm-comments", title: "Import Linear comments", status: "planned" },
      { id: "lm-parent-backfill", title: "Backfill parent links from Parent: AXI-* metadata", status: "planned" },
      { id: "lm-assignees", title: "Invite team plus map real assignees", status: "planned" },
      { id: "lm-axiom-row", title: "Dedicated AxiomRP row", status: "planned" },
      { id: "lm-subissues", title: "Sub-issues: parentId, drawer UI, hidden from board", status: "planned" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    summary: "Keep single-machine hosting simple before adding heavier deployment targets.",
    items: [
      { id: "health-check", title: "Health check endpoint GET /health", status: "done" },
      { id: "scheduled-backup", title: "Scheduled database backups", status: "planned" },
    ],
  },
];

export const ROADMAP_SHIPPED: ShippedItem[] = [
  { date: "2026-06", title: "Kanban: per-row columns, drag, assignees, timers, row colors" },
  { date: "2026-06", title: "Settings plus live preview plus profile sync" },
  { date: "2026-06", title: "Undo toast plus change history panel" },
  { date: "2026-06", title: "Issue drawer: edit, comments, status, priority, due, timer" },
  { date: "2026-06", title: "Immutable refs, resolve API, copy buttons, share URLs" },
  { date: "2026-06", title: "Row/column search, multi-assignees, row Edit menu" },
  { date: "2026-06", title: "Multi-select bulk edit" },
  { date: "2026-06", title: "Column drag-reorder" },
  { date: "2026-06", title: "Delete: immediate API soft-delete plus undo restore" },
  { date: "2026-06", title: "Linear import script" },
  { date: "2026-06", title: "Discord bot v1 — slash commands, Settings UI, role gating, thread /create" },
  { date: "2026-06", title: "Public release prep — AGPL, self-hosting docs, LXC update + SMTP" },
  { date: "2026-06", title: "Forgot password + optional SMTP email reset" },
  { date: "2026-06", title: "Large files v1 — chunked upload, range streaming, move/link, video player" },
];

export const ROADMAP_DEPLOY_STEPS: DeployStep[] = [
  { step: "Done", label: "Proxmox LXC + Cloudflare", detail: "git clone, install.sh, sudo update, teamflow-smtp." },
  { step: "Done", label: "File attachments", detail: "Issue + row uploads; backup data/uploads/ with the DB." },
  { step: "Always", label: "Backup teamflow.db + data/uploads/", detail: "That is your project data." },
];

export function countByStatus(
  items: Array<{ status: RoadmapStatus }>,
  status: RoadmapStatus,
) {
  return items.filter((item) => item.status === status).length;
}
