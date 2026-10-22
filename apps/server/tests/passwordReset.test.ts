import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  api,
  bootApp,
  json,
  login,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";
import { reloadConfig } from "../src/config.js";

let app: TestApp;
let user: RegisteredUser;

beforeAll(async () => {
  // NODE_ENV=development so the reset link is logged and the test can pick it up.
  process.env.NODE_ENV = "development";
  delete process.env.SMTP_HOST;
  app = await bootApp();
  user = await registerUser(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function requestReset(email: string) {
  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  const res = await api(app, "POST", "/auth/forgot-password", { body: { email } });
  spy.mockRestore();
  const token = logs
    .map((line) => /[?&]reset=([A-Za-z0-9_-]+)/.exec(line)?.[1])
    .find((value): value is string => Boolean(value));
  return { status: res.status, body: await json<{ message: string }>(res), token };
}

describe("password reset", () => {
  it("returns the same response whether or not the email exists", async () => {
    const known = await requestReset(user.email);
    const unknown = await requestReset("nobody-here@example.test");
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.message).not.toMatch(/server logs/);
  });

  it("invalidates existing sessions when the password is reset", async () => {
    const sessionA = (await login(app, user.email, user.password)).token;
    const sessionB = (await login(app, user.email, user.password)).token;
    expect((await api(app, "GET", "/auth/me", { token: sessionA })).status).toBe(200);

    const { token } = await requestReset(user.email);
    expect(token, "reset link should be logged in development").toBeTruthy();

    const reset = await api(app, "POST", "/auth/reset-password", {
      body: { token, password: "brand-new-password-1" },
    });
    expect(reset.status).toBe(200);

    expect((await api(app, "GET", "/auth/me", { token: sessionA })).status).toBe(401);
    expect((await api(app, "GET", "/auth/me", { token: sessionB })).status).toBe(401);
    expect((await api(app, "GET", "/auth/me", { token: user.token })).status).toBe(401);

    const fresh = await login(app, user.email, "brand-new-password-1");
    expect((await api(app, "GET", "/auth/me", { token: fresh.token })).status).toBe(200);
    user.password = "brand-new-password-1";
  });

  it("does not log the reset link outside development", async () => {
    process.env.NODE_ENV = "production";
    reloadConfig();
    try {
      const { token, status } = await requestReset(user.email);
      expect(status).toBe(200);
      expect(token).toBeUndefined();
    } finally {
      process.env.NODE_ENV = "development";
      reloadConfig();
    }
  });
});
