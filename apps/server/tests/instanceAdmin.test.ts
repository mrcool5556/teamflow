import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  json,
  login,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

let app: TestApp;
let first: RegisteredUser;
let second: RegisteredUser;

beforeAll(async () => {
  app = await bootApp({ TEAMFLOW_INSTANCE_ADMINS: "" });
  first = await registerUser(app);
  second = await registerUser(app);
});

describe("instance admin", () => {
  it("first registered user is instance admin, later users are not", async () => {
    const me1 = await json<{ user: { isInstanceAdmin: boolean } }>(
      await api(app, "GET", "/auth/me", { token: first.token }),
    );
    const me2 = await json<{ user: { isInstanceAdmin: boolean } }>(
      await api(app, "GET", "/auth/me", { token: second.token }),
    );
    expect(me1.user.isInstanceAdmin).toBe(true);
    expect(me2.user.isInstanceAdmin).toBe(false);
  });

  it("team Owner without instance admin cannot reach server-wide routes", async () => {
    const paths: [string, string][] = [
      ["GET", `/teams/${second.teamId}/server/maintenance`],
      ["GET", `/teams/${second.teamId}/server/maintenance/job`],
      ["POST", `/teams/${second.teamId}/server/maintenance/backup`],
      ["POST", `/teams/${second.teamId}/server/maintenance/update`],
      ["POST", `/teams/${second.teamId}/server/maintenance/job/dismiss`],
      ["GET", `/teams/${second.teamId}/integrations/discord/secrets`],
      ["PATCH", `/teams/${second.teamId}/integrations/discord/secrets`],
      ["POST", `/teams/${second.teamId}/integrations/discord/service/enable`],
      ["POST", `/teams/${second.teamId}/integrations/discord/service/restart`],
      ["POST", `/teams/${second.teamId}/integrations/discord/service/stop`],
    ];
    for (const [method, path] of paths) {
      const res = await api(app, method, path, {
        token: second.token,
        body: method === "GET" ? undefined : {},
      });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: expect.any(String) });
    }
  });

  it("instance admin who is team Owner can read maintenance status", async () => {
    const res = await api(app, "GET", `/teams/${first.teamId}/server/maintenance`, {
      token: first.token,
    });
    expect(res.status).toBe(200);
  });

  it("TEAMFLOW_INSTANCE_ADMINS grants the flag at login", async () => {
    process.env.TEAMFLOW_INSTANCE_ADMINS = ` Other@example.test , ${second.email.toUpperCase()} `;
    const session = await login(app, second.email, second.password);
    expect(session.user.isInstanceAdmin).toBe(true);
    const res = await api(app, "GET", `/teams/${second.teamId}/server/maintenance`, {
      token: session.token,
    });
    expect(res.status).toBe(200);
    process.env.TEAMFLOW_INSTANCE_ADMINS = "";
  });
});
