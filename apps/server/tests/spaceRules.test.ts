import { eq } from "drizzle-orm";
import { schema } from "@teamflow/db";
import { GIB } from "@teamflow/core";
import { beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, createTeam, json, registerUser, uniqueEmail, type TestApp } from "./helpers";
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

describe("free-space rules", () => {
  // The first account on this fresh database is the instance admin.
  let admin: Awaited<ReturnType<typeof registerUser>>;
  beforeAll(async () => {
    admin = await registerUser(app);
  });

  it("gives instance admins admin spaces with no cap", async () => {
    expect(await space(admin.teamId)).toEqual({
      spaceType: "admin",
      storageCapBytes: null,
      spaceOwnerId: admin.id,
    });
    for (const key of ["AA", "AB", "AC", "AD"]) {
      const teamId = await createTeam(app, admin.token, `Admin ${key}`, key);
      expect((await space(teamId))?.spaceType).toBe("admin");
    }
  });

  it("gives an admin listed in TEAMFLOW_INSTANCE_ADMINS an admin General", async () => {
    const listed = await registerUser(app, { email: envAdminEmail });
    expect((await space(listed.teamId))?.spaceType).toBe("admin");
  });

  it("makes other users' General and new teams free 1 GB spaces, at most 3", async () => {
    const user = await registerUser(app);
    expect(await space(user.teamId)).toEqual({
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
    const body = await json<{ code: string; error: string; owned: number; limit: number }>(
      refused,
    );
    expect(body).toMatchObject({ code: "free_space_limit", owned: 3, limit: 3 });
    expect(body.error).toMatch(/already have 3 free spaces/);

    // Deleting one frees a slot.
    const del = await api(app, "DELETE", `/teams/${second}`, { token: user.token });
    expect(del.status).toBe(204);
    await createTeam(app, user.token, "Four", "FOUR");
  });

  it("uses the admin's saved settings for new spaces only", async () => {
    const db = await getDb();
    const user = await registerUser(app);
    updateSpaceSettings(db, { freeSpacesPerUser: 1, freeSpaceCapBytes: 5 * GIB });
    try {
      const refused = await api(app, "POST", "/teams", {
        token: user.token,
        body: { name: "Extra", key: "EXTRA" },
      });
      expect(refused.status).toBe(409);
      // Existing spaces keep their cap; a new user's General gets the new one.
      expect((await space(user.teamId))?.storageCapBytes).toBe(GIB);
      const later = await registerUser(app);
      expect((await space(later.teamId))?.storageCapBytes).toBe(5 * GIB);
    } finally {
      updateSpaceSettings(db, { freeSpacesPerUser: 3, freeSpaceCapBytes: GIB });
    }
  });

  it("never blocks registration, even with a limit of 0", async () => {
    const db = await getDb();
    updateSpaceSettings(db, { freeSpacesPerUser: 0 });
    try {
      const user = await registerUser(app);
      expect((await space(user.teamId))?.spaceType).toBe("free");
    } finally {
      updateSpaceSettings(db, { freeSpacesPerUser: 3 });
    }
  });
});
