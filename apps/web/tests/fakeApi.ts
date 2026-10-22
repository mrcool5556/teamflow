import type {
  BoardRowPublic,
  CommentPublic,
  IssuePublic,
  IssueStatusPublic,
  TeamMemberPublic,
  TeamPermissionsPublic,
  TeamPublic,
  UserProfile,
  UserPublic,
} from "@teamflow/core";
import { createDefaultUserProfile, permissionsForSystemSlug } from "@teamflow/core";
import { vi } from "vitest";

/** In-memory stand-in for the Teamflow HTTP API, installed as global fetch. */
export type FakeDb = {
  user: UserPublic;
  profile: UserProfile;
  teams: TeamPublic[];
  rows: BoardRowPublic[];
  statuses: IssueStatusPublic[];
  issues: IssuePublic[];
  trashedIssueIds: Set<string>;
  members: TeamMemberPublic[];
  permissions: Record<string, TeamPermissionsPublic>;
  comments: CommentPublic[];
};

export type FakeCall = { method: string; path: string; body: unknown };

const now = "2026-10-01T10:00:00.000Z";

export function makeIssue(
  team: TeamPublic,
  number: number,
  rowId: string,
  status: IssueStatusPublic,
  extra: Partial<IssuePublic> = {},
): IssuePublic {
  return {
    id: `${team.key.toLowerCase()}-issue-${number}`,
    identifier: `${team.key}-${number}`,
    teamId: team.id,
    projectId: null,
    rowId,
    number,
    title: `${team.key} issue ${number}`,
    description: null,
    statusId: status.id,
    statusName: status.name,
    priority: "none",
    assigneeId: null,
    assigneeName: null,
    assignees: [],
    creatorId: "user-1",
    creatorName: "Ada",
    dueDate: null,
    boardSort: number,
    timerActiveAt: null,
    timerElapsedSec: 0,
    timerTargetSec: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    color: null,
    ...extra,
  };
}

function makeRow(team: TeamPublic, index: number): BoardRowPublic {
  return {
    id: `${team.key.toLowerCase()}-row-${index}`,
    teamId: team.id,
    key: `row_${team.key.toLowerCase()}000${index}`.slice(0, 12),
    name: `${team.key} row ${index}`,
    position: index - 1,
    assigneeId: null,
    assigneeName: null,
    assignees: [],
    color: null,
  };
}

function makeStatus(team: TeamPublic, row: BoardRowPublic, index: number, name: string) {
  return {
    id: `${row.id}-status-${index}`,
    teamId: team.id,
    rowId: row.id,
    key: `col_${row.id.replace(/[^a-z0-9]/g, "").slice(0, 6)}${index}${index}`.slice(0, 12),
    name,
    type: index === 1 ? "todo" : "in_progress",
    position: index - 1,
    color: null,
  } satisfies IssueStatusPublic;
}

/** Two teams (ENG with two rows, OPS with one), each row with Todo/Doing columns. */
export function seedDb(roleSlug: "owner" | "member" | "viewer" = "owner"): FakeDb {
  const user: UserPublic = {
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    createdAt: now,
    isInstanceAdmin: true,
  };
  const teams: TeamPublic[] = [
    {
      id: "00000000-0000-4000-8000-00000000e001",
      workspaceId: "ws",
      name: "Engineering",
      key: "ENG",
      createdAt: now,
    },
    {
      id: "00000000-0000-4000-8000-00000000e002",
      workspaceId: "ws",
      name: "Operations",
      key: "OPS",
      createdAt: now,
    },
  ];
  const [eng, ops] = teams as [TeamPublic, TeamPublic];
  const rows = [makeRow(eng, 1), makeRow(eng, 2), makeRow(ops, 1)];
  const statuses = rows.flatMap((row) => {
    const team = row.teamId === eng.id ? eng : ops;
    return [makeStatus(team, row, 1, "Todo"), makeStatus(team, row, 2, "Doing")];
  });
  const engTodo = statuses[0]!;
  const engDoing = statuses[1]!;
  const opsTodo = statuses[4]!;
  const issues = [
    makeIssue(eng, 1, rows[0]!.id, engTodo),
    makeIssue(eng, 2, rows[0]!.id, engTodo),
    makeIssue(eng, 3, rows[0]!.id, engDoing),
    makeIssue(ops, 1, rows[2]!.id, opsTodo),
  ];
  const roleName = roleSlug[0]!.toUpperCase() + roleSlug.slice(1);
  const permissions = Object.fromEntries(
    teams.map((team) => [
      team.id,
      {
        roleId: `${team.id}-${roleSlug}`,
        roleName,
        roleSlug,
        permissions: permissionsForSystemSlug(roleSlug),
      },
    ]),
  );
  const members: TeamMemberPublic[] = teams.flatMap((team) => [
    {
      id: `${team.id}-member-1`,
      userId: user.id,
      name: user.name,
      email: user.email,
      roleId: `${team.id}-${roleSlug}`,
      roleName,
      roleSlug,
      role: roleSlug,
    },
    {
      id: `${team.id}-member-2`,
      userId: "user-2",
      name: "Grace",
      email: "grace@example.com",
      roleId: `${team.id}-member`,
      roleName: "Member",
      roleSlug: "member",
      role: "member",
    },
  ]);
  return {
    user,
    profile: createDefaultUserProfile(),
    teams,
    rows,
    statuses,
    issues,
    trashedIssueIds: new Set(),
    members,
    permissions,
    comments: [],
  };
}

type Handler = (args: { params: string[]; body: unknown; query: URLSearchParams }) => unknown;

function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export type FakeApiOptions = {
  /** Return a promise to hold a response until it resolves (for race tests). Path has the query. */
  gate?: (method: string, path: string) => Promise<void> | undefined;
  /** Return an error message to make that request fail with HTTP 500. */
  fail?: (method: string, path: string) => string | undefined;
};

export function installFakeApi(db: FakeDb, options: FakeApiOptions = {}) {
  const calls: FakeCall[] = [];
  const membersOf = (teamId: string) =>
    db.members.filter((member) => member.id.startsWith(`${teamId}-`));
  const liveIssues = () => db.issues.filter((issue) => !db.trashedIssueIds.has(issue.id));
  const notFound = () => {
    throw Object.assign(new Error("Not found"), { status: 404 });
  };

  const routes: [string, RegExp, Handler][] = [
    ["GET", /^\/auth\/me$/, () => ({ user: db.user })],
    ["GET", /^\/auth\/config$/, () => ({ inviteOnly: false, passwordResetEmail: false })],
    ["GET", /^\/auth\/profile$/, () => ({ profile: db.profile })],
    ["PUT", /^\/auth\/profile$/, ({ body }) => ({ profile: (db.profile = body as UserProfile) })],
    ["PATCH", /^\/auth\/profile$/, () => ({ profile: db.profile })],
    ["POST", /^\/auth\/login$/, () => ({ user: db.user, token: "token-1" })],
    ["GET", /^\/teams$/, () => ({ teams: db.teams })],
    [
      "GET",
      /^\/teams\/([^/]+)\/statuses$/,
      ({ params }) => ({ statuses: db.statuses.filter((s) => s.teamId === params[0]) }),
    ],
    [
      "GET",
      /^\/teams\/([^/]+)\/rows$/,
      ({ params }) => ({ rows: db.rows.filter((r) => r.teamId === params[0]) }),
    ],
    ["GET", /^\/teams\/([^/]+)\/members$/, ({ params }) => ({ members: membersOf(params[0]!) })],
    [
      "GET",
      /^\/teams\/([^/]+)\/permissions\/me$/,
      ({ params }) => ({ permissions: db.permissions[params[0]!] ?? notFound() }),
    ],
    ["GET", /^\/teams\/([^/]+)\/roles$/, () => ({ roles: [] })],
    ["GET", /^\/teams\/([^/]+)\/invites$/, () => ({ invites: [] })],
    [
      "POST",
      /^\/teams\/([^/]+)\/invites$/,
      ({ params }) => ({ invite: { id: "invite-1", teamId: params[0], token: "tok-new" } }),
    ],
    [
      "GET",
      /^\/teams\/([^/]+)\/files$/,
      () => ({ files: [], totalBytes: 0, fileCount: 0, trash: false }),
    ],
    [
      "GET",
      /^\/teams\/([^/]+)\/resolve$/,
      ({ params, query }) => {
        const ref = query.get("ref") ?? "";
        const issue = liveIssues().find((i) => i.teamId === params[0] && i.identifier === ref);
        if (issue) return { resolved: { kind: "issue" }, issue };
        const row = db.rows.find((r) => r.teamId === params[0] && r.key === ref);
        if (row) return { resolved: { kind: "row" }, row };
        return notFound();
      },
    ],
    [
      "GET",
      /^\/issues$/,
      ({ query }) => ({ issues: liveIssues().filter((i) => i.teamId === query.get("teamId")) }),
    ],
    [
      "GET",
      /^\/issues\/([^/]+)$/,
      ({ params }) => ({
        issue: liveIssues().find((i) => i.id === params[0]) ?? notFound(),
        comments: db.comments.filter((c) => c.issueId === params[0]),
      }),
    ],
    [
      "PATCH",
      /^\/issues\/([^/]+)$/,
      ({ params, body }) => {
        const index = db.issues.findIndex((i) => i.id === params[0]);
        if (index < 0) return notFound();
        const patch = body as Partial<IssuePublic> & { assigneeIds?: string[] };
        const { assigneeIds, ...rest } = patch;
        const next = { ...db.issues[index]!, ...rest };
        if (assigneeIds) {
          next.assignees = assigneeIds.map((userId) => ({
            userId,
            name: db.members.find((m) => m.userId === userId)?.name ?? userId,
          }));
          next.assigneeId = assigneeIds[0] ?? null;
          next.assigneeName = next.assignees[0]?.name ?? null;
        }
        db.issues[index] = next;
        return { issue: next };
      },
    ],
    [
      "DELETE",
      /^\/issues\/([^/]+)$/,
      ({ params }) => {
        db.trashedIssueIds.add(params[0]!);
        return undefined;
      },
    ],
    [
      "POST",
      /^\/issues\/([^/]+)\/restore$/,
      ({ params }) => {
        db.trashedIssueIds.delete(params[0]!);
        return { issue: db.issues.find((i) => i.id === params[0]) ?? notFound() };
      },
    ],
    [
      "GET",
      /^\/issues\/([^/]+)\/attachments$/,
      () => ({
        attachments: [],
        limits: { imageBytes: 1, videoBytes: 1, zipBytes: 1, otherBytes: 1 },
      }),
    ],
    [
      "GET",
      /^\/rows\/([^/]+)\/attachments$/,
      () => ({
        attachments: [],
        limits: { imageBytes: 1, videoBytes: 1, zipBytes: 1, otherBytes: 1 },
      }),
    ],
    [
      "PATCH",
      /^\/rows\/([^/]+)$/,
      ({ params, body }) => {
        const index = db.rows.findIndex((r) => r.id === params[0]);
        if (index < 0) return notFound();
        db.rows[index] = { ...db.rows[index]!, ...(body as Partial<BoardRowPublic>) };
        return { row: db.rows[index] };
      },
    ],
    [
      "DELETE",
      /^\/rows\/([^/]+)$/,
      ({ params }) => {
        db.rows = db.rows.filter((r) => r.id !== params[0]);
        db.statuses = db.statuses.filter((s) => s.rowId !== params[0]);
        return undefined;
      },
    ],
    [
      "PATCH",
      /^\/statuses\/([^/]+)$/,
      ({ params, body }) => {
        const index = db.statuses.findIndex((s) => s.id === params[0]);
        if (index < 0) return notFound();
        db.statuses[index] = { ...db.statuses[index]!, ...(body as Partial<IssueStatusPublic>) };
        return { status: db.statuses[index] };
      },
    ],
    [
      "DELETE",
      /^\/issues\/([^/]+)\/comments\/([^/]+)$/,
      ({ params }) => {
        db.comments = db.comments.filter((c) => c.id !== params[1]);
        return undefined;
      },
    ],
    [
      "DELETE",
      /^\/statuses\/([^/]+)$/,
      ({ params }) => {
        db.statuses = db.statuses.filter((s) => s.id !== params[0]);
        return undefined;
      },
    ],
  ];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace(/^\/api/, "");
    const method = (init.method ?? "GET").toUpperCase();
    const body =
      typeof init.body === "string" && init.body ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path, body });

    const signal = init.signal;
    if (signal?.aborted) throw abortError();
    const gate = options.gate?.(method, `${path}${url.search}`);
    if (gate) {
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        void gate.then(resolve);
      });
    }

    const failure = options.fail?.(method, `${path}${url.search}`);
    if (failure) return json(500, { error: failure });

    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(path);
      if (!match) continue;
      try {
        const result = handler({ params: match.slice(1), body, query: url.searchParams });
        return json(result === undefined ? 204 : 200, result);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500;
        return json(status, { error: (err as Error).message });
      }
    }
    return json(404, { error: `No fake route for ${method} ${path}` });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** Pretend a session exists, as the login flow would leave it. */
export function signIn(db: FakeDb) {
  localStorage.setItem("teamflow_token", "token-1");
  localStorage.setItem("teamflow_user", JSON.stringify(db.user));
}
