import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  json,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";
import { ApiError, badRequest, forbidden, notFound } from "../src/lib/errors.js";

let app: TestApp;
let owner: RegisteredUser;
let outsider: RegisteredUser;

beforeAll(async () => {
  app = await bootApp();
  owner = await registerUser(app);
  outsider = await registerUser(app);
});

describe("ApiError", () => {
  it("carries status, code and message", () => {
    expect(notFound("Team not found")).toMatchObject({ status: 404, code: "not_found" });
    expect(forbidden()).toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Permission denied",
    });
    expect(badRequest("Nope").toBody()).toEqual({ error: "Nope", code: "bad_request" });
    expect(new ApiError(410, "Gone").code).toBe("gone");
    expect(new ApiError(418, "Teapot").code).toBe("bad_request");
    expect(new ApiError(502, "Upstream").code).toBe("internal_error");
  });
});

describe("error responses", () => {
  it("returns { error, code } for errors thrown in lib code", async () => {
    // outsider is not a member of owner's team: deleteTeam throws forbidden().
    const res = await api(app, "DELETE", `/teams/${owner.teamId}`, { token: outsider.token });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "Permission denied", code: "forbidden" });
  });

  it("maps not-found lib errors to 404", async () => {
    const teamId = await createTeam(app, owner.token, "Errors", "ERR");
    const res = await api(
      app,
      "PATCH",
      `/teams/${teamId}/roles/00000000-0000-4000-8000-000000000000`,
      {
        token: owner.token,
        body: { name: "Renamed" },
      },
    );
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Role not found", code: "not_found" });
  });

  it("keeps the write-scope refusal as a 403 with a code", async () => {
    const tokenRes = await api(app, "POST", "/auth/tokens", {
      token: owner.token,
      body: { name: "ro", scopes: ["read"] },
    });
    const { token } = await json<{ token: string }>(tokenRes);
    const res = await api(app, "POST", "/projects", {
      token,
      body: { teamId: owner.teamId, name: "P" },
    });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({
      error: "Token does not have write scope",
      code: "forbidden",
    });
  });

  it("tags every response with X-Request-Id and echoes a supplied one", async () => {
    const generated = await app.request("/health");
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await app.request("/health", { headers: { "X-Request-Id": "abc-123" } });
    expect(echoed.headers.get("x-request-id")).toBe("abc-123");
  });

  it("hides unexpected errors behind a generic 500 and logs them with the request id", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // A body that is not JSON makes c.req.json() throw a SyntaxError inside the handler.
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": "req-42" },
        body: "{not json",
      });
      expect(res.status).toBe(500);
      expect(await json(res)).toEqual({ error: "Internal Server Error", code: "internal_error" });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]![0])).toContain("req-42");
    } finally {
      spy.mockRestore();
    }
  });
});
