import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseWith, readJson } from "../lib/validation.js";
import {
  forgotPasswordSchema,
  loginSchema,
  parseUserProfileImport,
  registerSchema,
  resetPasswordSchema,
  SETUP_ERROR_CODES,
  setupAdminSchema,
  userProfilePatchSchema,
  userProfileSchema,
} from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
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
import { ApiError } from "../lib/errors.js";
import { createSetupAdmin, getSetupStatus, isSetupNeeded } from "../lib/setup.js";
import { getSiteName } from "../lib/siteSettings.js";
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
    siteName: getSiteName(),
    inviteOnly: isInviteOnlyRegistration(),
    setupNeeded: isSetupNeeded(db),
    ...getPasswordResetAuthConfig(),
  });
});

/** First-time setup: `needed` only while the server has no accounts (see lib/setup.ts). */
routes.get("/auth/setup", (c) => c.json({ setup: getSetupStatus(db) }));

/** Create the first account as instance admin; needs the setup code; refused once one exists. */
routes.post("/auth/setup/admin", async (c) => {
  const body = await parseBody(c, setupAdminSchema);
  const user = await createSetupAdmin(db, body);
  const token = await signSessionToken(user.id, user.tokenVersion);
  return c.json({ user: toUserPublic(user), token }, 201);
});

routes.post("/auth/register", async (c) => {
  const body = await parseBody(c, registerSchema);

  // On a fresh server the first account is the admin, made on /setup with the setup code.
  if (isSetupNeeded(db)) {
    throw new ApiError(
      409,
      "This server isn't set up yet. The person installing it creates the first account on /setup.",
      SETUP_ERROR_CODES.required,
    );
  }

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
  const inviteToken = body.inviteToken;

  // The account and invite acceptance land together or not at all. No team is made here: the
  // welcome page offers Create a Flow / Join a Flow, and an invite joins that Flow directly.
  db.transaction((tx) => {
    // A fresh server's first account comes from /auth/setup/admin, so this one is never first.
    tx.insert(schema.users)
      .values({ id: userId, email: body.email, name: body.name, passwordHash, isInstanceAdmin: 0 })
      .run();

    if (inviteToken) {
      acceptTeamInvite(tx, inviteToken, userId);
    }
  });

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
