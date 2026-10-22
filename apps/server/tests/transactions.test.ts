import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  api,
  bootApp,
  json,
  registerUser,
  uniqueEmail,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let owner: RegisteredUser;

beforeAll(async () => {
  app = await bootApp();
  owner = await registerUser(app);
});

async function createInvite(maxUses: 1 | null = 1) {
  const res = await api(app, "POST", `/teams/${owner.teamId}/invites`, {
    token: owner.token,
    body: { maxUses },
  });
  return (await json<{ invite: { token: string } }>(res)).invite.token;
}

describe("transactions", () => {
  it("allocates distinct issue numbers under concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        api(app, "POST", "/issues", {
          token: owner.token,
          body: { teamId: owner.teamId, title: `Parallel ${i}` },
        }),
      ),
    );
    const numbers = await Promise.all(
      results.map(async (res) => (await json<{ issue: { number: number } }>(res)).issue.number),
    );
    expect(new Set(numbers).size).toBe(15);
  });

  it("backs issue numbers with a unique index", async () => {
    const { db } = await import("../src/db.js");
    const index = db.get<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'issues_team_number_unique'`,
    );
    expect(index?.name).toBe("issues_team_number_unique");
  });

  it("lets a single-use invite be accepted only once, even concurrently", async () => {
    const token = await createInvite(1);
    const a = await registerUser(app);
    const b = await registerUser(app);
    const [first, second] = await Promise.all([
      api(app, "POST", `/invites/${token}/accept`, { token: a.token }),
      api(app, "POST", `/invites/${token}/accept`, { token: b.token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
  });

  it("rolls back a registration whose invite was used up meanwhile", async () => {
    const token = await createInvite(1);
    const emails = [uniqueEmail("race"), uniqueEmail("race")];
    const results = await Promise.all(
      emails.map((email) =>
        api(app, "POST", "/auth/register", {
          body: { email, name: "Racer", password: "correct-horse-battery", inviteToken: token },
        }),
      ),
    );
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 400]);

    // The losing account was not created: its email can still register (without the invite).
    const loser = emails[results.findIndex((res) => res.status === 400)]!;
    const retry = await api(app, "POST", "/auth/register", {
      body: { email: loser, name: "Racer", password: "correct-horse-battery" },
    });
    expect(retry.status).toBe(201);
  });

  it("keeps row positions contiguous after reorder and delete", async () => {
    const created: string[] = [];
    for (const name of ["A", "B", "C"]) {
      const res = await api(app, "POST", `/teams/${owner.teamId}/rows`, {
        token: owner.token,
        body: { name },
      });
      created.push((await json<{ row: { id: string } }>(res)).row.id);
    }
    await api(app, "PATCH", `/rows/${created[2]}`, { token: owner.token, body: { position: 0 } });
    await api(app, "DELETE", `/rows/${created[0]}`, { token: owner.token });
    const { rows } = await json<{ rows: { id: string; position: number }[] }>(
      await api(app, "GET", `/teams/${owner.teamId}/rows`, { token: owner.token }),
    );
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
    expect(rows[0]!.id).toBe(created[2]);
    expect(rows.some((row) => row.id === created[0])).toBe(false);
  });
});
