import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  joinTeam,
  json,
  listRoles,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let owner: RegisteredUser;
let admin: RegisteredUser;
let teamId: string;
let roleIds: Record<string, string>;
let ownerMemberId: string;
let adminMemberId: string;

beforeAll(async () => {
  app = await bootApp();
  owner = await registerUser(app);
  admin = await registerUser(app);
  teamId = owner.teamId;
  await joinTeam(app, owner.token, teamId, admin.token, "admin");
  const roles = await listRoles(app, owner.token, teamId);
  roleIds = Object.fromEntries(roles.map((r) => [r.slug, r.id]));
  const { members } = await json<{ members: { id: string; userId: string }[] }>(
    await api(app, "GET", `/teams/${teamId}/members`, { token: owner.token }),
  );
  ownerMemberId = members.find((m) => m.userId === owner.id)!.id;
  adminMemberId = members.find((m) => m.userId === admin.id)!.id;
});

describe("role grant capping", () => {
  it("admin cannot create a role granting permissions they do not hold", async () => {
    const res = await api(app, "POST", `/teams/${teamId}/roles`, {
      token: admin.token,
      body: { name: "Sneaky", permissions: ["team.members.view", "server.maintenance.run"] },
    });
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toMatch(/do not hold/);
  });

  it("admin can still create a role within their own permissions", async () => {
    const res = await api(app, "POST", `/teams/${teamId}/roles`, {
      token: admin.token,
      body: { name: "Helper", permissions: ["team.members.view", "team.invites.manage"] },
    });
    expect(res.status).toBe(201);
  });

  it("admin cannot add unheld permissions when editing a role", async () => {
    const res = await api(app, "PATCH", `/teams/${teamId}/roles/${roleIds.member}`, {
      token: admin.token,
      body: { permissions: ["team.members.view", "team.data.transfer"] },
    });
    expect(res.status).toBe(403);
  });

  it("owner can grant any permission", async () => {
    const res = await api(app, "POST", `/teams/${teamId}/roles`, {
      token: owner.token,
      body: { name: "Ops", permissions: ["server.maintenance.view", "server.maintenance.run"] },
    });
    expect(res.status).toBe(201);
  });

  it("admin cannot create an Owner invite", async () => {
    const res = await api(app, "POST", `/teams/${teamId}/invites`, {
      token: admin.token,
      body: { roleId: roleIds.owner },
    });
    expect(res.status).toBe(403);
    const asSlug = await api(app, "POST", `/teams/${teamId}/invites`, {
      token: admin.token,
      body: { role: "owner" },
    });
    expect(asSlug.status).toBe(403);
    const ok = await api(app, "POST", `/teams/${teamId}/invites`, {
      token: admin.token,
      body: { roleId: roleIds.admin },
    });
    expect(ok.status).toBe(201);
  });

  it("admin cannot promote themselves to Owner or demote the Owner", async () => {
    const promote = await api(app, "PATCH", `/teams/${teamId}/members/${adminMemberId}`, {
      token: admin.token,
      body: { roleId: roleIds.owner },
    });
    expect(promote.status).toBe(403);
    const demote = await api(app, "PATCH", `/teams/${teamId}/members/${ownerMemberId}`, {
      token: admin.token,
      body: { roleId: roleIds.member },
    });
    expect(demote.status).toBe(403);
  });

  it("admin cannot remove an Owner", async () => {
    // Add a second owner so the "last owner" guard is not what blocks the request.
    const second = await registerUser(app);
    await joinTeam(app, owner.token, teamId, second.token, "owner");
    const { members } = await json<{ members: { id: string; userId: string }[] }>(
      await api(app, "GET", `/teams/${teamId}/members`, { token: owner.token }),
    );
    const secondMemberId = members.find((m) => m.userId === second.id)!.id;
    const res = await api(app, "DELETE", `/teams/${teamId}/members/${secondMemberId}`, {
      token: admin.token,
    });
    expect(res.status).toBe(403);
    const byOwner = await api(app, "DELETE", `/teams/${teamId}/members/${secondMemberId}`, {
      token: owner.token,
    });
    expect(byOwner.status).toBe(204);
  });
});
