import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseWith, readJson } from "../lib/validation.js";
import {
  forgotPasswordSchema,
  loginSchema,
  parseUserProfileImport,
  registerSchema,
  resetPasswordSchema,
  userProfilePatchSchema,
  userProfileSchema,
} from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { createDefaultBoardRow } from "../lib/board.js";
import {
  hashPassword,
  signSessionToken,
  syncInstanceAdminFromEnv,
  toUserPublic,
  verifyPassword,
} from "../lib/auth.js";
import {
  getPasswordResetAuthConfig,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../lib/passwordReset.js";
import {
  acceptTeamInvite,
  assertInviteAcceptable,
  isInviteOnlyRegistration,
} from "../lib/invites.js";
import { getTeamRoleBySlug, seedDefaultTeamRoles } from "../lib/roles.js";
import { getOrCreatePersonalWorkspace } from "../lib/teams.js";
import {
  buildProfileExport,
  getUserProfile,
  patchUserProfile,
  saveUserProfile,
} from "../lib/profile.js";

/** Registration, login, password reset and the signed-in user's profile. */
const routes = new Hono<AppEnv>();

routes.get("/auth/config", (c) => {
  return c.json({
    inviteOnly: isInviteOnlyRegistration(),
    ...getPasswordResetAuthConfig(),
  });
});

routes.post("/auth/register", async (c) => {
  const body = await parseBody(c, registerSchema);

  const inviteOnly = isInviteOnlyRegistration();
  if (inviteOnly && !body.inviteToken) {
    return c.json({ error: "Registration requires a valid invite link" }, 403);
  }

  if (body.inviteToken) {
    await assertInviteAcceptable(db, body.inviteToken);
  }

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1);

  if (existing[0]) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  // The first account on a fresh install becomes instance admin (server-wide settings).
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  const isFirstUser = Number(userCount?.count ?? 0) === 0;

  await db.insert(schema.users).values({
    id: userId,
    email: body.email,
    name: body.name,
    passwordHash,
    isInstanceAdmin: isFirstUser ? 1 : 0,
  });

  const workspaceId = await getOrCreatePersonalWorkspace(db, userId, body.name);

  const teamId = crypto.randomUUID();
  await db.insert(schema.teams).values({
    id: teamId,
    workspaceId,
    name: "General",
    key: "GEN",
  });

  await seedDefaultTeamRoles(db, teamId);
  const ownerRole = await getTeamRoleBySlug(db, teamId, "owner");
  if (!ownerRole) {
    return c.json({ error: "Failed to initialize team roles" }, 500);
  }

  await db.insert(schema.teamMembers).values({
    teamId,
    userId,
    roleId: ownerRole.id,
    role: ownerRole.slug,
  });

  await createDefaultBoardRow(db, teamId);

  if (body.inviteToken) {
    await acceptTeamInvite(db, body.inviteToken, userId);
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  await syncInstanceAdminFromEnv(db, user!);

  const token = await signSessionToken(userId, user!.tokenVersion);
  return c.json({ user: toUserPublic(user!), token }, 201);
});

routes.post("/auth/login", async (c) => {
  const body = await parseBody(c, loginSchema, { message: "Invalid credentials" });

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1);

  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  await syncInstanceAdminFromEnv(db, user);
  const token = await signSessionToken(user.id, user.tokenVersion);
  return c.json({ user: toUserPublic(user), token });
});

routes.post("/auth/forgot-password", async (c) => {
  const body = await parseBody(c, forgotPasswordSchema);

  const result = await requestPasswordReset(db, body.email);
  return c.json(result);
});

routes.post("/auth/reset-password", async (c) => {
  const body = await parseBody(c, resetPasswordSchema);

  await resetPasswordWithToken(db, body.token, body.password);
  return c.json({ ok: true });
});

routes.get("/auth/me", requireAuth, async (c) => {
  const auth = c.var.auth;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user: toUserPublic(user) });
});

routes.get("/auth/profile", requireAuth, async (c) => {
  const auth = c.var.auth;

  const profile = await getUserProfile(db, auth.userId);
  return c.json({ profile });
});

routes.put("/auth/profile", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = await parseBody(c, userProfileSchema);

  const profile = await saveUserProfile(db, auth.userId, body);
  return c.json({ profile });
});

routes.patch("/auth/profile", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = await parseBody(c, userProfilePatchSchema);

  const profile = await patchUserProfile(db, auth.userId, body);
  return c.json({ profile });
});

routes.get("/auth/profile/export", requireAuth, async (c) => {
  const auth = c.var.auth;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);

  const profile = await getUserProfile(db, auth.userId);
  return c.json(buildProfileExport(profile, { name: user.name, email: user.email }));
});

routes.post("/auth/profile/import", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const profile = parseWith(userProfileSchema, parseUserProfileImport(await readJson(c)), {
    message: "Invalid profile file",
  });

  const saved = await saveUserProfile(db, auth.userId, profile);
  return c.json({ profile: saved });
});

export { routes as authRoutes };
