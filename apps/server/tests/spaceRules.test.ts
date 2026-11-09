import { eq } from "drizzle-orm";
import { schema } from "@teamflow/db";
import { GIB } from "@teamflow/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  json,
  registerAccount,
  uniqueEmail,
  type RegisteredAccount,
  type TestApp,
} from "./helpers";
import { updateSpaceSettings } from "../src/lib/spaceSettings.js";

let app: TestApp;
const envAdminEmail = uniqueEmail("envadmin");

beforeAll(async () => {
  app = await bootApp({ TEAMFLOW_INSTANCE_ADMINS: envAdminEmail });
});

async function getDb() {
  const { db } = await import("../src/db.js");
  return db;
}

async function space(teamId: string) {
  const db = await getDb();
  return db
    .select({
      spaceType: schema.teams.spaceType,
      storageCapBytes: schema.teams.storageCapBytes,
      spaceOwnerId: schema.teams.spaceOwnerId,
    })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .get();
}

async function teamsOf(token: string) {
  const res = await api(app, "GET", "/teams", { token });
  return (
    await json<{
      teams: { id: string; key: string; spaceType: string; storageCapBytes: number }[];
    }>(res)
  ).teams;
}

async function myRole(token: string, teamId: string, userId: string) {
  const res = await api(app, "GET", `/teams/${teamId}/members`, { token });
  const { members } = await json<{ members: { userId: string; roleSlug: string }[] }>(res);
  return members.find((m) => m.userId === userId)?.roleSlug;
}

describe("signing up", () => {
  // The first account on this fresh database is the instance admin (through setup).
  beforeAll(async () => {
    await registerAccount(app, { name: "Admin" });
  });

  it("makes an account with no team; the welcome page offers Create or Join a Flow", async () => {
    const user = await registerAccount(app);
    expect(await teamsOf(user.token)).toEqual([]);
  });

  it("with an invite, joins only that Flow", async () => {
    const owner = await registerAccount(app);
    const teamId = await createTeam(app, owner.token, "Axiom", "AXIOM");
    const inviteRes = await api(app, "POST", `/teams/${teamId}/invites`, {
      token: owner.token,
      body: {},
    });
    const { invite } = await json<{ invite: { token: string } }>(inviteRes);
    const invited = await registerAccount(app, { inviteToken: invite.token });
    expect((await teamsOf(invited.token)).map((t) => t.key)).toEqual(["AXIOM"]);
  });
});

describe("free-space rules", () => {
  let admin: RegisteredAccount;
  beforeAll(async () => {
    const db = await getDb();
    const anyAdmin = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.isInstanceAdmin, 1))
      .get();
    expect(anyAdmin).toBeTruthy(); // made by "signing up" above
    admin = await registerAccount(app, { email: envAdminEmail });
  });

  it("makes you the Owner of a Flow you create", async () => {
    const user = await registerAccount(app);
    const teamId = await createTeam(app, user.token, "Mine", "MINE");
    expect(await myRole(user.token, teamId, user.id)).toBe("owner");
  });

  it("gives instance admins admin spaces with no cap", async () => {
    for (const key of ["AA", "AB", "AC", "AD"]) {
      const teamId = await createTeam(app, admin.token, `Admin ${key}`, key);
      expect(await space(teamId)).toEqual({
        spaceType: "admin",
        storageCapBytes: null,
        spaceOwnerId: admin.id,
      });
    }
  });

  it("lists each team's space type and cap", async () => {
    const user = await registerAccount(app);
    await createTeam(app, user.token, "Listed", "LIST");
    expect((await teamsOf(user.token))[0]).toMatchObject({
      spaceType: "free",
      storageCapBytes: GIB,
    });
  });

  it("makes other users' Flows free 1 GB spaces, at most 3", async () => {
    const user = await registerAccount(app);
    const first = await createTeam(app, user.token, "One", "ONE");
    expect(await space(first)).toEqual({
      spaceType: "free",
      storageCapBytes: GIB,
      spaceOwnerId: user.id,
    });
    const second = await createTeam(app, user.token, "Two", "TWO");
    await createTeam(app, user.token, "Three", "THREE");
    expect(await space(second)).toMatchObject({ spaceType: "free", storageCapBytes: GIB });

    const refused = await api(app, "POST", "/teams", {
      token: user.token,
      body: { name: "Four", key: "FOUR" },
    });
    expect(refused.status).toBe(409);
    const body = await json<{ code: string; error: string; owned: number; limit: number }>(refused);
    expect(body).toMatchObject({ code: "free_space_limit", owned: 3, limit: 3 });

    // Deleting one frees a slot.
    const del = await api(app, "DELETE", `/teams/${second}`, { token: user.token });
    expect(del.status).toBe(204);
    await createTeam(app, user.token, "Four", "FOUR");
  });

  it("uses the admin's saved settings for new spaces only", async () => {
    const db = await getDb();
    const user = await registerAccount(app);
    const first = await createTeam(app, user.token, "Before", "BEFORE");
    updateSpaceSettings(db, { freeSpacesPerUser: 1, freeSpaceCapBytes: 5 * GIB });
    try {
      const refused = await api(app, "POST", "/teams", {
        token: user.token,
        body: { name: "Extra", key: "EXTRA" },
      });
      expect(refused.status).toBe(409);
      // Existing spaces keep their cap; a new user's first Flow gets the new one.
      expect((await space(first))?.storageCapBytes).toBe(GIB);
      const later = await registerAccount(app);
      const laterTeam = await createTeam(app, later.token, "Later", "LATER");
      expect((await space(laterTeam))?.storageCapBytes).toBe(5 * GIB);
    } finally {
      updateSpaceSettings(db, { freeSpacesPerUser: 3, freeSpaceCapBytes: GIB });
    }
  });

  it("never refuses someone's first Flow, even with a limit of 0", async () => {
    const db = await getDb();
    updateSpaceSettings(db, { freeSpacesPerUser: 0 });
    try {
      const user = await registerAccount(app);
      const teamId = await createTeam(app, user.token, "Zero", "ZERO");
      expect((await space(teamId))?.spaceType).toBe("free");
      const second = await api(app, "POST", "/teams", {
        token: user.token,
        body: { name: "More", key: "MORE" },
      });
      expect(second.status).toBe(409);
    } finally {
      updateSpaceSettings(db, { freeSpacesPerUser: 3 });
    }
  });
});
