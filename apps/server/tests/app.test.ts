import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";

let app: Hono;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.JWT_SECRET = "test-secret-not-for-production";
  ({ app } = await import("../src/index.js"));
});

describe("server", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET /auth/me without a token returns 401", async () => {
    const res = await app.request("/auth/me");
    expect(res.status).toBe(401);
  });
});
