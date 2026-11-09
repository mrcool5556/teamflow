import type { Hono } from "hono";

export type TestApp = Hono;

let counter = 0;

/**
 * Boot the server against a fresh in-memory database. Call once per test file (in beforeAll).
 * Defaults come from setupEnv.ts; `env` overrides are applied and the config reloaded before
 * the app module is imported.
 */
export async function bootApp(env: Record<string, string> = {}): Promise<TestApp> {
  process.env.DATABASE_URL = ":memory:";
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  const mod = await import("../src/index.js");
  return mod.app;
}

export function uniqueEmail(prefix = "user") {
  counter += 1;
  return `${prefix}${counter}-${Date.now()}@example.test`;
}

export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function api(
  app: TestApp,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData || typeof options.body === "string") {
      body = options.body as BodyInit;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  }
  return app.request(path, { method, headers, body });
}

export type RegisteredUser = {
  id: string;
  email: string;
  password: string;
  token: string;
  /** The "General" (GEN) team registerUser makes for the user (they are its Owner). */
  teamId: string;
};

export type RegisteredAccount = Omit<RegisteredUser, "teamId">;

/**
 * Register an account as a person signing up would: no team (registration makes none). On a
 * fresh server the first account goes through setup and becomes the instance admin.
 */
export async function registerAccount(
  app: TestApp,
  overrides: { email?: string; name?: string; password?: string; inviteToken?: string } = {},
): Promise<RegisteredAccount> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? "correct-horse-battery";
  const name = overrides.name ?? "Test User";
  let res = await api(app, "POST", "/auth/register", {
    body: { email, name, password, inviteToken: overrides.inviteToken },
  });
  if (res.status === 409 && (await res.clone().json()).code === "setup_required") {
    res = await api(app, "POST", "/auth/setup/admin", {
      body: { code: await setupCode(), email, name, password },
    });
  }
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
  const data = await json<{ user: { id: string }; token: string }>(res);
  return { id: data.user.id, email, password, token: data.token };
}

/**
 * registerAccount plus a team the user owns, which most tests need: "General" (key GEN), made
 * the way registration made it before the welcome page (Owner, the user's first free space, or
 * an admin space for an instance admin).
 */
export async function registerUser(
  app: TestApp,
  overrides: { email?: string; name?: string; password?: string } = {},
): Promise<RegisteredUser> {
  const account = await registerAccount(app, overrides);
  await ownTeam(account.id, overrides.name ?? "Test User");
  const teams = await listTeams(app, account.token);
  return { ...account, teamId: teams[0]!.id };
}

async function listTeams(app: TestApp, token: string) {
  const res = await api(app, "GET", "/teams", { token });
  return (await json<{ teams: { id: string }[] }>(res)).teams;
}

async function ownTeam(userId: string, userName: string) {
  const { db } = await import("../src/db.js");
  const { createTeamWithOwner, spaceForUserCreatedTeam } = await import("../src/lib/teams.js");
  const { userIsInstanceAdmin } = await import("../src/lib/auth.js");
  const isInstanceAdmin = await userIsInstanceAdmin(db, userId);
  db.transaction((tx) =>
    createTeamWithOwner(tx, {
      userId,
      userName,
      name: "General",
      key: "GEN",
      role: "owner",
      space: spaceForUserCreatedTeam(tx, { userId, isInstanceAdmin, firstSpace: true }),
    }),
  );
}

/** The setup code a fresh test server expects (lib/setup.ts). */
export async function setupCode() {
  const { db } = await import("../src/db.js");
  const { currentSetupCodeForTests } = await import("../src/lib/setup.js");
  return currentSetupCodeForTests(db) ?? "";
}

export async function login(app: TestApp, email: string, password: string) {
  const res = await api(app, "POST", "/auth/login", { body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  return json<{ user: { id: string; isInstanceAdmin?: boolean }; token: string }>(res);
}

export async function createTeam(app: TestApp, token: string, name = "Second", key = "SEC") {
  const res = await api(app, "POST", "/teams", { token, body: { name, key } });
  if (res.status !== 201) {
    throw new Error(`createTeam failed: ${res.status} ${await res.text()}`);
  }
  const { team } = await json<{ team: { id: string } }>(res);
  return team.id;
}

export async function listRoles(app: TestApp, token: string, teamId: string) {
  const res = await api(app, "GET", `/teams/${teamId}/roles`, { token });
  const { roles } = await json<{ roles: { id: string; slug: string }[] }>(res);
  return roles;
}

/** Add `userToken`'s user to `teamId` with the given system role via an invite. */
export async function joinTeam(
  app: TestApp,
  ownerToken: string,
  teamId: string,
  userToken: string,
  role: "owner" | "admin" | "member" | "viewer" = "member",
) {
  const roles = await listRoles(app, ownerToken, teamId);
  const roleId = roles.find((r) => r.slug === role)?.id;
  const inviteRes = await api(app, "POST", `/teams/${teamId}/invites`, {
    token: ownerToken,
    body: { roleId },
  });
  if (inviteRes.status !== 201) {
    throw new Error(`invite failed: ${inviteRes.status} ${await inviteRes.text()}`);
  }
  const { invite } = await json<{ invite: { token: string } }>(inviteRes);
  const acceptRes = await api(app, "POST", `/invites/${invite.token}/accept`, {
    token: userToken,
  });
  if (acceptRes.status !== 200) {
    throw new Error(`accept failed: ${acceptRes.status} ${await acceptRes.text()}`);
  }
}
