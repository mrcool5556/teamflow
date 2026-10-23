import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { schema } from "@teamflow/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  joinTeam,
  json,
  listRoles,
  registerUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let scratch: string;
let uploadDir: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-team-delete-test-"));
  uploadDir = path.join(scratch, "uploads");
  app = await bootApp({ UPLOAD_DIR: uploadDir });
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function getDb() {
  const { db } = await import("../src/db.js");
  return db;
}

/**
 * A fresh user's "General" team (they are its Owner) with a second member, a pending invite,
 * a row, a column, an issue, a comment and a file.
 */
async function buildPopulatedTeam() {
  const owner = await registerUser(app);
  const teamId = owner.teamId;
  const member = await registerUser(app);
  await joinTeam(app, owner.token, teamId, member.token, "member");

  const roles = await listRoles(app, owner.token, teamId);
  const pending = await api(app, "POST", `/teams/${teamId}/invites`, {
    token: owner.token,
    body: { roleId: roles.find((r) => r.slug === "viewer")!.id },
  });
  expect(pending.status).toBe(201);

  const rowRes = await api(app, "POST", `/teams/${teamId}/rows`, {
    token: owner.token,
    body: { name: "Extra row" },
  });
  expect(rowRes.status).toBe(201);
  const { row } = await json<{ row: { id: string } }>(rowRes);

  const statusRes = await api(app, "POST", `/rows/${row.id}/statuses`, {
    token: owner.token,
    body: { name: "Extra column" },
  });
  expect(statusRes.status).toBe(201);
  const { status } = await json<{ status: { id: string } }>(statusRes);

  const issueRes = await api(app, "POST", "/issues", {
    token: owner.token,
    body: { teamId, title: "Has everything", rowId: row.id, statusId: status.id },
  });
  expect(issueRes.status).toBe(201);
  const { issue } = await json<{ issue: { id: string } }>(issueRes);

  const commentRes = await api(app, "POST", `/issues/${issue.id}/comments`, {
    token: member.token,
    body: { body: "A comment" },
  });
  expect(commentRes.status).toBe(201);

  const form = new FormData();
  form.append("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
  const up = await api(app, "POST", `/issues/${issue.id}/attachments`, {
    token: owner.token,
    body: form,
  });
  expect(up.status).toBe(201);

  const db = await getDb();
  const files = await db
    .select({ id: schema.storedFiles.id, storagePath: schema.storedFiles.storagePath })
    .from(schema.storedFiles)
    .innerJoin(schema.issueFileLinks, eq(schema.issueFileLinks.fileId, schema.storedFiles.id))
    .where(eq(schema.issueFileLinks.issueId, issue.id));
  expect(files).toHaveLength(1);
  const filePath = path.join(uploadDir, files[0]!.storagePath);
  expect(fs.existsSync(filePath)).toBe(true);

  return { teamId, owner, member, issueId: issue.id, fileIds: files.map((f) => f.id), filePath };
}

async function expectTeamGone(team: Awaited<ReturnType<typeof buildPopulatedTeam>>) {
  const db = await getDb();
  const { teamId } = team;
  expect(await db.select().from(schema.teams).where(eq(schema.teams.id, teamId))).toHaveLength(0);
  for (const table of [
    schema.teamMembers,
    schema.teamRoles,
    schema.teamInvites,
    schema.issues,
    schema.boardRows,
    schema.issueStatuses,
  ]) {
    expect(await db.select().from(table).where(eq(table.teamId, teamId))).toHaveLength(0);
  }
  expect(
    await db.select().from(schema.comments).where(eq(schema.comments.issueId, team.issueId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(schema.storedFiles).where(inArray(schema.storedFiles.id, team.fileIds)),
  ).toHaveLength(0);
  expect(fs.existsSync(team.filePath)).toBe(false);
}

describe("DELETE /teams/:teamId", () => {
  it("lets the owner delete a team with members, invites, board data and files", async () => {
    const team = await buildPopulatedTeam();
    const otherTeamId = await createTeam(app, team.owner.token, "Survivor", "SURV");
    const res = await api(app, "DELETE", `/teams/${team.teamId}`, { token: team.owner.token });
    expect(res.status).toBe(204);
    await expectTeamGone(team);

    // The owner's other team is untouched.
    const teams = await json<{ teams: { id: string }[] }>(
      await api(app, "GET", "/teams", { token: team.owner.token }),
    );
    expect(teams.teams.map((t) => t.id)).toEqual([otherTeamId]);
  });

  it("lets an admin with team.delete delete the team", async () => {
    const team = await buildPopulatedTeam();
    const admin = await registerUser(app);
    await joinTeam(app, team.owner.token, team.teamId, admin.token, "admin");

    const res = await api(app, "DELETE", `/teams/${team.teamId}`, { token: admin.token });
    expect(res.status).toBe(204);
    await expectTeamGone(team);
  });

  it("refuses a member without team.delete with a 403 and a code", async () => {
    const team = await buildPopulatedTeam();
    const res = await api(app, "DELETE", `/teams/${team.teamId}`, { token: team.member.token });
    expect(res.status).toBe(403);
    const body = await json<{ error: string; code: string }>(res);
    expect(body.code).toBeTruthy();

    const db = await getDb();
    expect(
      await db.select().from(schema.teams).where(eq(schema.teams.id, team.teamId)),
    ).toHaveLength(1);
    expect(fs.existsSync(team.filePath)).toBe(true);
  });
});

describe("removing members never trips the role foreign keys", () => {
  it("gives the last admin a clear 403 when they try to leave", async () => {
    const creator = await registerUser(app);
    // POST /teams makes the creator the team's only Admin.
    const teamId = await createTeam(app, creator.token, "Solo admin", "SOLO");
    const res = await api(app, "DELETE", `/teams/${teamId}/members/me`, { token: creator.token });
    expect(res.status).toBe(403);
    const body = await json<{ error: string; code: string }>(res);
    expect(body.error).toBe("Cannot remove the last admin");
    expect(body.code).toBeTruthy();
  });

  it("gives an owner a clear 403 when removing the last admin", async () => {
    const owner = await registerUser(app);
    const lone = await registerUser(app);
    await joinTeam(app, owner.token, owner.teamId, lone.token, "admin");
    const members = await json<{ members: { id: string; userId: string }[] }>(
      await api(app, "GET", `/teams/${owner.teamId}/members`, { token: owner.token }),
    );
    const memberId = members.members.find((m) => m.userId === lone.id)!.id;
    const res = await api(app, "DELETE", `/teams/${owner.teamId}/members/${memberId}`, {
      token: owner.token,
    });
    expect(res.status).toBe(403);
    const body = await json<{ error: string; code: string }>(res);
    expect(body.error).toBe("Cannot remove the last admin");
    expect(body.code).toBeTruthy();
  });
});
