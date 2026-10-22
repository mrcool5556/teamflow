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
let teamA: string;
let teamB: string;
let rowB: string;
let issueB: string;
let patA: string;

async function mintToken(token: string, body: Record<string, unknown>) {
  const res = await api(app, "POST", "/auth/tokens", { token, body });
  return {
    status: res.status,
    data: await json<{ token?: string; id?: string; error?: string }>(res),
  };
}

beforeAll(async () => {
  app = await bootApp();
  user = await registerUser(app);
  teamA = user.teamId;
  teamB = await createTeam(app, user.token, "Beta", "BET");

  const rows = await json<{ rows: { id: string }[] }>(
    await api(app, "GET", `/teams/${teamB}/rows`, { token: user.token }),
  );
  rowB = rows.rows[0]!.id;
  const created = await json<{ issue: { id: string } }>(
    await api(app, "POST", "/issues", { token: user.token, body: { teamId: teamB, title: "B1" } }),
  );
  issueB = created.issue.id;

  const minted = await mintToken(user.token, { name: "scoped", teamId: teamA });
  expect(minted.status).toBe(201);
  patA = minted.data.token!;
});

describe("PAT team scope", () => {
  it("allows the scoped team", async () => {
    expect((await api(app, "GET", `/teams/${teamA}/rows`, { token: patA })).status).toBe(200);
  });

  it("blocks other teams on team, row, issue and status routes", async () => {
    const statuses = await json<{ statuses: { id: string }[] }>(
      await api(app, "GET", `/rows/${rowB}/statuses`, { token: user.token }),
    );
    const statusB = statuses.statuses[0]!.id;
    const checks: [string, string, unknown?][] = [
      ["GET", `/teams/${teamB}/rows`],
      ["GET", `/teams/${teamB}/members`],
      ["GET", `/rows/${rowB}/statuses`],
      ["PATCH", `/rows/${rowB}`, { name: "x" }],
      ["GET", `/issues/${issueB}`],
      ["PATCH", `/issues/${issueB}`, { title: "x" }],
      ["PATCH", `/statuses/${statusB}`, { name: "x" }],
      ["GET", `/issues/${issueB}/attachments`],
      ["DELETE", `/teams/${teamB}`],
    ];
    for (const [method, path, body] of checks) {
      const res = await api(app, method, path, { token: patA, body });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    const projects = await json<{ projects: { teamId: string }[] }>(
      await api(app, "GET", "/projects", { token: patA }),
    );
    expect(projects.projects.every((p) => p.teamId === teamA)).toBe(true);
  });

  it("read-only PAT cannot mint tokens; scoped PAT cannot widen scope", async () => {
    const readOnly = await mintToken(user.token, { name: "ro", scopes: ["read"] });
    expect(readOnly.status).toBe(201);
    const attempt = await mintToken(readOnly.data.token!, { name: "escalate" });
    expect(attempt.status).toBe(403);

    const widen = await mintToken(patA, { name: "wide" });
    expect(widen.status).toBe(403);
    const sameTeam = await mintToken(patA, { name: "same", teamId: teamA });
    expect(sameTeam.status).toBe(201);
  });

  it("lists tokens without secrets and revokes them", async () => {
    const list = await json<{ tokens: Record<string, unknown>[] }>(
      await api(app, "GET", "/auth/tokens", { token: user.token }),
    );
    expect(list.tokens.length).toBeGreaterThan(0);
    for (const row of list.tokens) {
      expect(row).not.toHaveProperty("token");
      expect(row).not.toHaveProperty("tokenHash");
      expect(row).toHaveProperty("prefix");
    }
    const victim = list.tokens.find((t) => t.name === "ro")!;
    const del = await api(app, "DELETE", `/auth/tokens/${victim.id}`, { token: user.token });
    expect(del.status).toBe(204);
    const again = await api(app, "DELETE", `/auth/tokens/${victim.id}`, { token: user.token });
    expect(again.status).toBe(404);

    const other = await registerUser(app);
    const mine = list.tokens.find((t) => t.name === "scoped")!;
    const foreign = await api(app, "DELETE", `/auth/tokens/${mine.id}`, { token: other.token });
    expect(foreign.status).toBe(404);
  });
});
