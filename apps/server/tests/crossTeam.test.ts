import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  json,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let user: RegisteredUser;
let outsider: RegisteredUser;
let teamA: string;
let teamB: string;
let rowB: string;
let statusB: string;
let projectB: string;
let issueA: string;

beforeAll(async () => {
  app = await bootApp();
  user = await registerUser(app);
  outsider = await registerUser(app);
  teamA = user.teamId;
  teamB = await createTeam(app, user.token, "Beta", "BET");

  const rows = await json<{ rows: { id: string }[] }>(
    await api(app, "GET", `/teams/${teamB}/rows`, { token: user.token }),
  );
  rowB = rows.rows[0]!.id;
  const statuses = await json<{ statuses: { id: string }[] }>(
    await api(app, "GET", `/rows/${rowB}/statuses`, { token: user.token }),
  );
  statusB = statuses.statuses[0]!.id;
  const project = await json<{ project: { id: string } }>(
    await api(app, "POST", "/projects", { token: user.token, body: { teamId: teamB, name: "P" } }),
  );
  projectB = project.project.id;
  const issue = await json<{ issue: { id: string } }>(
    await api(app, "POST", "/issues", { token: user.token, body: { teamId: teamA, title: "A1" } }),
  );
  issueA = issue.issue.id;
});

describe("cross-team references", () => {
  it("POST /issues rejects a row, project, status or assignee from another team", async () => {
    const cases: Record<string, unknown>[] = [
      { rowId: rowB },
      { projectId: projectB },
      { statusId: statusB },
      { assigneeId: outsider.id },
    ];
    for (const extra of cases) {
      const res = await api(app, "POST", "/issues", {
        token: user.token,
        body: { teamId: teamA, title: "bad", ...extra },
      });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("PATCH /issues rejects a row, project or status from another team", async () => {
    for (const body of [{ rowId: rowB }, { projectId: projectB }, { statusId: statusB }]) {
      const res = await api(app, "PATCH", `/issues/${issueA}`, { token: user.token, body });
      expect([400, 404], JSON.stringify(body)).toContain(res.status);
    }
    const check = await json<{ issue: { rowId: string; projectId: string | null } }>(
      await api(app, "GET", `/issues/${issueA}`, { token: user.token }),
    );
    expect(check.issue.rowId).not.toBe(rowB);
    expect(check.issue.projectId).toBeNull();
  });

  it("same-team references still work", async () => {
    const rows = await json<{ rows: { id: string }[] }>(
      await api(app, "GET", `/teams/${teamA}/rows`, { token: user.token }),
    );
    const res = await api(app, "POST", "/issues", {
      token: user.token,
      body: { teamId: teamA, title: "ok", rowId: rows.rows[0]!.id, assigneeId: user.id },
    });
    expect(res.status).toBe(201);
  });

  it("GET /teams/:id/members requires team.members.view", async () => {
    const role = await json<{ role: { id: string } }>(
      await api(app, "POST", `/teams/${teamA}/roles`, {
        token: user.token,
        body: { name: "Blind", permissions: ["team.roles.view"] },
      }),
    );
    const invite = await json<{ invite: { token: string } }>(
      await api(app, "POST", `/teams/${teamA}/invites`, {
        token: user.token,
        body: { roleId: role.role.id },
      }),
    );
    await api(app, "POST", `/invites/${invite.invite.token}/accept`, { token: outsider.token });
    const res = await api(app, "GET", `/teams/${teamA}/members`, { token: outsider.token });
    expect(res.status).toBe(403);
    const asOwner = await api(app, "GET", `/teams/${teamA}/members`, { token: user.token });
    expect(asOwner.status).toBe(200);
  });
});
