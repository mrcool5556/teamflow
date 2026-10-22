import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  joinTeam,
  json,
  listRoles,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let owner: RegisteredUser;
let member: RegisteredUser;
let stranger: RegisteredUser;
let teamId: string;

beforeAll(async () => {
  app = await bootApp();
  owner = await registerUser(app);
  member = await registerUser(app);
  stranger = await registerUser(app);
  teamId = await createTeam(app, owner.token, "Middleware", "MID");
  await joinTeam(app, owner.token, teamId, member.token, "member");
});

describe("requireAuth / requireWrite", () => {
  it("answers 401 with a code when no bearer token is sent", async () => {
    const res = await api(app, "GET", `/teams/${teamId}/rows`);
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized", code: "unauthorized" });
  });

  it("blocks read-only PATs before the handler runs", async () => {
    const { token } = await json<{ token: string }>(
      await api(app, "POST", "/auth/tokens", {
        token: owner.token,
        body: { name: "ro", scopes: ["read"], teamId },
      }),
    );
    const res = await api(app, "POST", `/teams/${teamId}/rows`, { token, body: { name: "R" } });
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "forbidden" });
    const read = await api(app, "GET", `/teams/${teamId}/rows`, { token });
    expect(read.status).toBe(200);
  });
});

describe("loadTeam", () => {
  it("resolves the team from a row, column and issue and rejects outsiders", async () => {
    const { rows } = await json<{ rows: { id: string }[] }>(
      await api(app, "GET", `/teams/${teamId}/rows`, { token: owner.token }),
    );
    const rowId = rows[0]!.id;
    const { statuses } = await json<{ statuses: { id: string }[] }>(
      await api(app, "GET", `/rows/${rowId}/statuses`, { token: owner.token }),
    );
    const { issue } = await json<{ issue: { id: string } }>(
      await api(app, "POST", "/issues", {
        token: owner.token,
        body: { teamId, title: "Loaded" },
      }),
    );

    for (const path of [
      `/rows/${rowId}/statuses`,
      `/rows/${rowId}/attachments`,
      `/issues/${issue.id}`,
      `/issues/${issue.id}/attachments`,
    ]) {
      const ok = await api(app, "GET", path, { token: member.token });
      expect(ok.status, path).toBe(200);
      const denied = await api(app, "GET", path, { token: stranger.token });
      expect(denied.status, path).toBe(403);
      expect(await json(denied)).toEqual({ error: "Team access denied", code: "forbidden" });
    }
    const status = await api(app, "PATCH", `/statuses/${statuses[0]!.id}`, {
      token: stranger.token,
      body: { name: "Nope" },
    });
    expect(status.status).toBe(403);
  });

  it("returns 404 for unknown entities before any access decision", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const cases: [string, string][] = [
      [`/rows/${missing}/statuses`, "Row not found"],
      [`/issues/${missing}`, "Issue not found"],
      [`/uploads/${missing}`, "Upload session not found"],
      [`/attachments/${missing}/download`, "Attachment not found"],
    ];
    for (const [path, message] of cases) {
      const res = await api(app, "GET", path, { token: stranger.token });
      expect(res.status, path).toBe(404);
      expect(await json(res)).toEqual({ error: message, code: "not_found" });
    }
  });

  it("applies the PAT team scope on entity routes", async () => {
    const otherTeam = await createTeam(app, owner.token, "Other", "OTH");
    const { token } = await json<{ token: string }>(
      await api(app, "POST", "/auth/tokens", {
        token: owner.token,
        body: { name: "scoped", teamId: otherTeam },
      }),
    );
    const res = await api(app, "GET", `/teams/${teamId}/rows`, { token });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "Team access denied", code: "forbidden" });
  });
});

describe("requirePermission", () => {
  it("accepts any one of several permissions for the role list", async () => {
    // A plain member has none of team.roles.view / members.manage / invites.manage.
    const denied = await api(app, "GET", `/teams/${teamId}/roles`, { token: member.token });
    expect(denied.status).toBe(403);
    expect(await json(denied)).toEqual({ error: "Permission denied", code: "forbidden" });

    const roles = await listRoles(app, owner.token, teamId);
    const inviter = await api(app, "POST", `/teams/${teamId}/roles`, {
      token: owner.token,
      body: { name: "Inviter", permissions: ["team.invites.manage"] },
    });
    const { role } = await json<{ role: { id: string } }>(inviter);
    const { members } = await json<{ members: { userId: string; id: string }[] }>(
      await api(app, "GET", `/teams/${teamId}/members`, { token: owner.token }),
    );
    const membership = members.find((m) => m.userId === member.id)!;
    await api(app, "PATCH", `/teams/${teamId}/members/${membership.id}`, {
      token: owner.token,
      body: { roleId: role.id },
    });
    const allowed = await api(app, "GET", `/teams/${teamId}/roles`, { token: member.token });
    expect(allowed.status).toBe(200);
    expect(roles.length).toBeGreaterThan(0);
  });
});

describe("optionalAuth", () => {
  it("lets anonymous and signed-in users preview an invite", async () => {
    const { invite } = await json<{ invite: { token: string } }>(
      await api(app, "POST", `/teams/${teamId}/invites`, { token: owner.token, body: {} }),
    );
    const anon = await json<{ preview: { alreadyMember: boolean } }>(
      await api(app, "GET", `/invites/${invite.token}`),
    );
    expect(anon.preview.alreadyMember).toBe(false);
    const asMember = await json<{ preview: { alreadyMember: boolean } }>(
      await api(app, "GET", `/invites/${invite.token}`, { token: member.token }),
    );
    expect(asMember.preview.alreadyMember).toBe(true);
  });
});
