import { beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

let app: TestApp;
let user: RegisteredUser;
let issueId: string;

beforeAll(async () => {
  app = await bootApp();
  user = await registerUser(app);
  const res = await api(app, "POST", "/issues", {
    token: user.token,
    body: { teamId: user.teamId, title: "Validated" },
  });
  issueId = (await json<{ issue: { id: string } }>(res)).issue.id;
});

function raw(path: string, body: string, method = "POST") {
  return app.request(path, {
    method,
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
    body,
  });
}

describe("request validation", () => {
  it("answers malformed JSON with 400, not 500", async () => {
    for (const path of ["/auth/login", "/issues", `/issues/${issueId}/comments`, "/auth/tokens"]) {
      const res = await raw(path, "{not json");
      expect(res.status, path).toBe(400);
      expect(await json(res)).toEqual({ error: "Malformed JSON body", code: "validation_error" });
    }
  });

  it("treats an empty body as {} so optional-only routes still work", async () => {
    const res = await app.request(`/teams/${user.teamId}/invites`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status).toBe(201);
  });

  it("reports schema failures as validation_error with the first issue message", async () => {
    const res = await api(app, "POST", "/issues", {
      token: user.token,
      body: { teamId: user.teamId, title: "" },
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "validation_error", error: expect.any(String) });
    const login = await api(app, "POST", "/auth/login", { body: { email: "nope" } });
    expect(await json(login)).toEqual({ error: "Invalid credentials", code: "validation_error" });
  });

  it("validates path parameters before any lookup", async () => {
    for (const path of [`/issues/not-a-uuid`, `/rows/123/statuses`, `/teams/x/rows`]) {
      const res = await api(app, "GET", path, { token: user.token });
      expect(res.status, path).toBe(400);
      expect(await json(res)).toMatchObject({ code: "validation_error" });
    }
    const me = await api(app, "DELETE", `/teams/${user.teamId}/members/me`, { token: user.token });
    // "me" is accepted; the sole owner may not leave (403), which proves validation passed.
    expect(me.status).toBe(403);
    const chunk = await app.request(`/uploads/${issueId}/chunks/abc`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${user.token}` },
      body: "x",
    });
    expect(chunk.status).toBe(400);
    expect(await json(chunk)).toEqual({ error: "Invalid chunk index", code: "validation_error" });
  });

  it("validates the previously hand-parsed upload, move and link bodies", async () => {
    const upload = await api(app, "POST", `/issues/${issueId}/uploads`, {
      token: user.token,
      body: { filename: "  ", totalBytes: 10 },
    });
    expect(upload.status).toBe(400);
    const okUpload = await api(app, "POST", `/issues/${issueId}/uploads`, {
      token: user.token,
      body: { filename: " a.bin ", totalBytes: 10.7 },
    });
    expect(okUpload.status).toBe(201);
    const { session } = await json<{ session: { filename: string; totalBytes: number } }>(okUpload);
    expect(session).toMatchObject({ filename: "a.bin", totalBytes: 10 });

    const link = await api(app, "POST", `/issues/${issueId}/attachments/link`, {
      token: user.token,
      body: { fileId: "nope" },
    });
    expect(link.status).toBe(400);
    const move = await api(
      app,
      "POST",
      `/issues/${issueId}/attachments/00000000-0000-4000-8000-000000000000/move`,
      { token: user.token, body: {} },
    );
    expect(move.status).toBe(400);
  });

  it("validates list query parameters", async () => {
    const issues = await api(app, "GET", "/issues?teamId=abc", { token: user.token });
    expect(issues.status).toBe(400);
    const projects = await api(app, "GET", "/projects?teamId=abc", { token: user.token });
    expect(projects.status).toBe(400);
    const ok = await api(app, "GET", `/issues?teamId=${user.teamId}`, { token: user.token });
    expect(ok.status).toBe(200);
  });
});
