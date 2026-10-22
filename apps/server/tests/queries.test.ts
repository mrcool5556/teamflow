import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";
import { LAST_USED_THROTTLE_MS, shouldTouchLastUsed } from "../src/lib/auth.js";

let app: TestApp;
let alice: RegisteredUser;
let bob: RegisteredUser;

async function createIssue(user: RegisteredUser, title: string, description?: string) {
  const res = await api(app, "POST", "/issues", {
    token: user.token,
    body: { teamId: user.teamId, title, description },
  });
  return (await json<{ issue: { id: string } }>(res)).issue.id;
}

async function listIssues(user: RegisteredUser, query = "") {
  const res = await api(app, "GET", `/issues${query}`, { token: user.token });
  expect(res.status).toBe(200);
  return (await json<{ issues: { id: string; title: string; teamId: string }[] }>(res)).issues;
}

beforeAll(async () => {
  app = await bootApp();
  alice = await registerUser(app);
  bob = await registerUser(app);
});

describe("issue listing", () => {
  it("returns only the caller's teams, skips trash and applies filters in SQL", async () => {
    const keep = await createIssue(alice, "Alpha Widget", "Has the NEEDLE inside");
    const trashed = await createIssue(alice, "Trashed");
    await api(app, "DELETE", `/issues/${trashed}`, { token: alice.token });
    await createIssue(bob, "Bob only");

    const mine = await listIssues(alice);
    expect(mine.every((issue) => issue.teamId === alice.teamId)).toBe(true);
    expect(mine.some((issue) => issue.id === keep)).toBe(true);
    expect(mine.some((issue) => issue.id === trashed)).toBe(false);

    expect((await listIssues(alice, "?search=needle")).map((i) => i.id)).toEqual([keep]);
    expect((await listIssues(alice, "?search=widget")).map((i) => i.id)).toEqual([keep]);
    expect(await listIssues(alice, `?teamId=${bob.teamId}`)).toEqual([]);
  });

  it("uses the same number of queries for 2 issues as for 20", async () => {
    const { db } = await import("../src/db.js");
    const client = (db as unknown as { $client: { prepare: (...args: unknown[]) => unknown } })
      .$client;
    const countQueries = async (user: RegisteredUser) => {
      const spy = vi.spyOn(client, "prepare");
      try {
        await listIssues(user);
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    const small = await registerUser(app);
    const big = await registerUser(app);
    for (let i = 0; i < 2; i += 1) await createIssue(small, `Small ${i}`);
    for (let i = 0; i < 20; i += 1) await createIssue(big, `Big ${i}`);
    const smallCount = await countQueries(small);
    expect(smallCount).toBeGreaterThan(0);
    expect(await countQueries(big)).toBe(smallCount);
  });
});

describe("projects", () => {
  it("lists only projects of the caller's teams", async () => {
    await api(app, "POST", "/projects", {
      token: alice.token,
      body: { teamId: alice.teamId, name: "Alice project" },
    });
    await api(app, "POST", "/projects", {
      token: bob.token,
      body: { teamId: bob.teamId, name: "Bob project" },
    });
    const { projects } = await json<{ projects: { teamId: string }[] }>(
      await api(app, "GET", "/projects", { token: alice.token }),
    );
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((project) => project.teamId === alice.teamId)).toBe(true);
  });
});

describe("indexes and PAT bookkeeping", () => {
  it("creates the query indexes", async () => {
    const { db } = await import("../src/db.js");
    const names = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .map((row) => row.name);
    for (const name of [
      "issues_team_id_idx",
      "issues_status_id_idx",
      "issues_row_id_idx",
      "comments_issue_id_idx",
      "api_tokens_token_hash_idx",
      "activity_issue_created_idx",
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it("writes PAT lastUsedAt at most once per window", async () => {
    const now = Date.now();
    expect(shouldTouchLastUsed(null, now)).toBe(true);
    expect(shouldTouchLastUsed(new Date(now - 1000).toISOString(), now)).toBe(false);
    expect(shouldTouchLastUsed(new Date(now - LAST_USED_THROTTLE_MS).toISOString(), now)).toBe(
      true,
    );

    const { token } = await json<{ token: string }>(
      await api(app, "POST", "/auth/tokens", { token: alice.token, body: { name: "t" } }),
    );
    await api(app, "GET", "/auth/me", { token });
    const first = await json<{ tokens: { lastUsedAt: string | null }[] }>(
      await api(app, "GET", "/auth/tokens", { token: alice.token }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await api(app, "GET", "/auth/me", { token });
    const second = await json<{ tokens: { lastUsedAt: string | null }[] }>(
      await api(app, "GET", "/auth/tokens", { token: alice.token }),
    );
    expect(first.tokens[0]!.lastUsedAt).toBeTruthy();
    expect(second.tokens[0]!.lastUsedAt).toBe(first.tokens[0]!.lastUsedAt);
  });
});
