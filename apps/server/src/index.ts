import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCommentSchema,
  createBoardRowSchema,
  createIssueSchema,
  createProjectSchema,
  createStatusSchema,
  createTeamInviteSchema,
  createTeamRoleSchema,
  createTeamSchema,
  createTokenSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateBoardRowSchema,
  updateIssueSchema,
  updateStatusSchema,
  updateTeamDiscordSettingsSchema,
  updateDiscordBotSecretsSchema,
  updateTeamMemberRoleSchema,
  updateTeamRoleSchema,
  userProfilePatchSchema,
  userProfileSchema,
  parseUserProfileImport,
  resolveRefSchema,
} from "@teamflow/core";
import { createDb, schema } from "@teamflow/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import {
  countRowIssues,
  countStatusIssues,
  createBoardRowWithKey,
  createDefaultBoardRow,
  createStatusWithKey,
  getDefaultRowId,
  mapBoardRow,
  mapIssueStatus,
} from "./lib/board.js";
import {
  filterValidTeamMemberIds,
  setBoardRowAssignees,
  setIssueAssignees,
} from "./lib/assignees.js";
import {
  generatePat,
  hashPassword,
  logActivity,
  requireWrite,
  resolveAuth,
  toUserPublic,
  verifyPassword,
  signSessionToken,
} from "./lib/auth.js";
import {
  getPasswordResetAuthConfig,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./lib/passwordReset.js";
import {
  getDoneStatusId,
  getTeamKey,
  listIssuesForUser,
  mapIssue,
  userHasTeamAccess,
} from "./lib/issues.js";
import {
  acceptTeamInvite,
  assertInviteAcceptable,
  createTeamInvite,
  getInvitePreview,
  isInviteOnlyRegistration,
  listTeamInvites,
  revokeTeamInvite,
} from "./lib/invites.js";
import { leaveTeam, removeTeamMember } from "./lib/members.js";
import {
  createTeamRole,
  deleteTeamRole,
  getTeamRoleBySlug,
  listTeamRoles,
  seedDefaultTeamRoles,
  updateTeamMemberRole,
  updateTeamRole,
} from "./lib/roles.js";
import { deleteTeam, createTeamForUser, getOrCreatePersonalWorkspace } from "./lib/teams.js";
import {
  buildProfileExport,
  getUserProfile,
  patchUserProfile,
  saveUserProfile,
} from "./lib/profile.js";
import { resolveTeamRefDetailed } from "./lib/refs.js";
import {
  AttachmentError,
  deleteIssueAttachment,
  getAttachmentForDownload,
  getAttachmentLimits,
  getFileTeamId,
  linkFileToIssue,
  linkFileToRow,
  listIssueAttachments,
  listRowAttachments,
  listTeamFiles,
  moveIssueAttachment,
  purgeExpiredDeletedFiles,
  restoreTeamFile,
  saveIssueAttachment,
  saveRowAttachment,
  deleteRowAttachment,
  softDeleteTeamFile,
} from "./lib/attachments.js";
import {
  abortUploadSession,
  completeUploadSession,
  createUploadSession,
  getUploadSession,
  purgeExpiredUploadSessions,
  saveUploadChunk,
} from "./lib/chunkedUpload.js";
import { createFileRangeResponse } from "./lib/fileStream.js";
import { signStreamToken, streamTokenExpiresAt, verifyStreamToken } from "./lib/streamTokens.js";
import {
  getDiscordGuildConfig,
  getTeamDiscordSettings,
  updateTeamDiscordSettings,
} from "./lib/discord.js";
import {
  getDiscordBotRuntimeConfig,
  getDiscordBotSecretsPublic,
  updateDiscordBotSecrets,
} from "./lib/discordSecrets.js";
import { assertBotConfigKey } from "./lib/secretsCrypto.js";
import {
  getTeamPermissionsForUser,
  userHasTeamPermission,
} from "./lib/permissions.js";

const db = createDb();
void purgeExpiredUploadSessions(db);
void purgeExpiredDeletedFiles(db);
const app = new Hono();

app.onError((err, c) => {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Internal Server Error";
  if (status >= 500) {
    console.error(err);
  }
  return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 409 | 500);
});

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

async function requireAuth(c: Context) {
  const auth = await resolveAuth(db, c.req.header("Authorization"));
  if (!auth) {
    return { error: c.json({ error: "Unauthorized" }, 401) };
  }
  return { auth };
}

app.get("/auth/config", (c) => {
  return c.json({
    inviteOnly: isInviteOnlyRegistration(),
    ...getPasswordResetAuthConfig(),
  });
});

app.post("/auth/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const inviteOnly = isInviteOnlyRegistration();
  if (inviteOnly && !body.data.inviteToken) {
    return c.json({ error: "Registration requires a valid invite link" }, 403);
  }

  if (body.data.inviteToken) {
    try {
      await assertInviteAcceptable(db, body.data.inviteToken);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Invalid invite" },
        400,
      );
    }
  }

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.data.email))
    .limit(1);

  if (existing[0]) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(body.data.password);

  await db.insert(schema.users).values({
    id: userId,
    email: body.data.email,
    name: body.data.name,
    passwordHash,
  });

  const workspaceId = await getOrCreatePersonalWorkspace(db, userId, body.data.name);

  const teamId = crypto.randomUUID();
  await db.insert(schema.teams).values({
    id: teamId,
    workspaceId,
    name: "General",
    key: "GEN",
  });

  await seedDefaultTeamRoles(db, teamId);
  const adminRole = await getTeamRoleBySlug(db, teamId, "admin");
  if (!adminRole) {
    return c.json({ error: "Failed to initialize team roles" }, 500);
  }

  await db.insert(schema.teamMembers).values({
    teamId,
    userId,
    roleId: adminRole.id,
    role: adminRole.slug,
  });

  await createDefaultBoardRow(db, teamId);

  if (body.data.inviteToken) {
    try {
      await acceptTeamInvite(db, body.data.inviteToken, userId);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to accept invite" },
        400,
      );
    }
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const token = await signSessionToken(userId);
  return c.json({ user: toUserPublic(user!), token }, 201);
});

app.post("/auth/login", async (c) => {
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "Invalid credentials" }, 400);
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.data.email))
    .limit(1);

  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signSessionToken(user.id);
  return c.json({ user: toUserPublic(user), token });
});

app.post("/auth/forgot-password", async (c) => {
  const body = forgotPasswordSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid email" }, 400);
  }

  const result = await requestPasswordReset(db, body.data.email);
  return c.json(result);
});

app.post("/auth/reset-password", async (c) => {
  const body = resetPasswordSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    await resetPasswordWithToken(db, body.data.token, body.data.password);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      400,
    );
  }
});

app.get("/auth/me", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, result.auth.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user: toUserPublic(user) });
});

app.get("/auth/profile", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const profile = await getUserProfile(db, result.auth.userId);
  return c.json({ profile });
});

app.put("/auth/profile", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const body = userProfileSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid profile" }, 400);
  }

  const profile = await saveUserProfile(db, result.auth.userId, body.data);
  return c.json({ profile });
});

app.patch("/auth/profile", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const body = userProfilePatchSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid profile patch" }, 400);
  }

  const profile = await patchUserProfile(db, result.auth.userId, body.data);
  return c.json({ profile });
});

app.get("/auth/profile/export", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, result.auth.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);

  const profile = await getUserProfile(db, result.auth.userId);
  return c.json(
    buildProfileExport(profile, { name: user.name, email: user.email }),
  );
});

app.post("/auth/profile/import", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const raw = await c.req.json();
  const profile = parseUserProfileImport(raw);
  const validated = userProfileSchema.safeParse(profile);
  if (!validated.success) {
    return c.json({ error: "Invalid profile file" }, 400);
  }

  const saved = await saveUserProfile(db, result.auth.userId, validated.data);
  return c.json({ profile: saved });
});

app.post("/auth/tokens", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const body = createTokenSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  if (body.data.teamId) {
    const hasAccess = await userHasTeamAccess(
      db,
      result.auth.userId,
      body.data.teamId,
    );
    if (!hasAccess) {
      return c.json({ error: "Team access denied" }, 403);
    }
  }

  const { raw, prefix, hash } = generatePat();
  const id = crypto.randomUUID();

  await db.insert(schema.apiTokens).values({
    id,
    userId: result.auth.userId,
    name: body.data.name,
    tokenHash: hash,
    prefix,
    scopes: JSON.stringify(body.data.scopes),
    teamId: body.data.teamId,
  });

  return c.json(
    {
      id,
      name: body.data.name,
      prefix,
      scopes: body.data.scopes,
      teamId: body.data.teamId ?? null,
      token: raw,
      createdAt: new Date().toISOString(),
    },
    201,
  );
});

app.get("/teams", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const rows = await db
    .select({
      id: schema.teams.id,
      workspaceId: schema.teams.workspaceId,
      name: schema.teams.name,
      key: schema.teams.key,
      createdAt: schema.teams.createdAt,
    })
    .from(schema.teams)
    .innerJoin(
      schema.teamMembers,
      eq(schema.teamMembers.teamId, schema.teams.id),
    )
    .where(eq(schema.teamMembers.userId, result.auth.userId));

  return c.json({ teams: rows });
});

app.post("/teams", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const body = createTeamSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const [user] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, result.auth.userId))
    .limit(1);

  const team = await createTeamForUser(db, {
    userId: result.auth.userId,
    userName: user?.name ?? "User",
    name: body.data.name,
    key: body.data.key,
  });

  await createDefaultBoardRow(db, team.id);

  return c.json({ team }, 201);
});

app.delete("/teams/:teamId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");

  try {
    await deleteTeam(db, teamId, result.auth.userId);
    return c.body(null, 204);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete team";
    const status =
      message === "Permission denied" || message === "Admin access required"
        ? 403
        : message === "Team not found"
          ? 404
          : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/teams/:teamId/statuses", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.teamId, teamId));

  statuses.sort((a, b) => {
    if (a.rowId !== b.rowId) return a.rowId.localeCompare(b.rowId);
    return a.position - b.position;
  });
  return c.json({ statuses: statuses.map(mapIssueStatus) });
});

app.get("/rows/:rowId/statuses", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const rowId = c.req.param("rowId");
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId));

  statuses.sort((a, b) => a.position - b.position);
  return c.json({ statuses: statuses.map(mapIssueStatus) });
});

app.post("/rows/:rowId/statuses", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = createStatusSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const existing = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId));
  const position = existing.length;

  const id = await createStatusWithKey(db, {
    teamId: row.teamId,
    rowId,
    name: body.data.name,
    type: body.data.type,
    position,
  });

  const [status] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, id))
    .limit(1);

  return c.json({ status: mapIssueStatus(status!) }, 201);
});

app.post("/teams/:teamId/statuses", async (c) => {
  return c.json(
    {
      error:
        "Columns are per row. Use POST /rows/:rowId/statuses to add a column to a specific row.",
    },
    410,
  );
});

app.patch("/statuses/:statusId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const statusId = c.req.param("statusId");
  const [existing] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, statusId))
    .limit(1);

  if (!existing) return c.json({ error: "Status not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = updateStatusSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  if (body.data.name !== undefined) {
    await db
      .update(schema.issueStatuses)
      .set({ name: body.data.name })
      .where(eq(schema.issueStatuses.id, statusId));
  }

  if (body.data.color !== undefined) {
    await db
      .update(schema.issueStatuses)
      .set({ color: body.data.color })
      .where(eq(schema.issueStatuses.id, statusId));
  }

  if (body.data.position !== undefined) {
    const rowStatuses = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, existing.rowId));
    rowStatuses.sort((a, b) => a.position - b.position);

    const fromIndex = rowStatuses.findIndex((status) => status.id === statusId);
    if (fromIndex === -1) {
      return c.json({ error: "Status not found" }, 404);
    }

    const targetIndex = Math.min(body.data.position, rowStatuses.length - 1);
    const [moved] = rowStatuses.splice(fromIndex, 1);
    rowStatuses.splice(targetIndex, 0, moved!);

    for (let index = 0; index < rowStatuses.length; index += 1) {
      await db
        .update(schema.issueStatuses)
        .set({ position: index })
        .where(eq(schema.issueStatuses.id, rowStatuses[index]!.id));
    }
  }

  const [status] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, statusId))
    .limit(1);

  return c.json({ status: mapIssueStatus(status!) });
});

app.delete("/statuses/:statusId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const statusId = c.req.param("statusId");
  const [existing] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, statusId))
    .limit(1);

  if (!existing) return c.json({ error: "Status not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const issueCount = await countStatusIssues(db, statusId);
  if (issueCount > 0) {
    return c.json({ error: "Column has issues — move or delete them first" }, 409);
  }

  await db
    .delete(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, statusId));

  return c.body(null, 204);
});

app.get("/teams/:teamId/rows", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  let rows = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId));

  if (rows.length === 0) {
    await createDefaultBoardRow(db, teamId);
    rows = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.teamId, teamId));
  }

  rows.sort((a, b) => a.position - b.position);
  return c.json({ rows: await Promise.all(rows.map((row) => mapBoardRow(db, row))) });
});

app.get("/teams/:teamId/members", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const members = await db
    .select({
      id: schema.teamMembers.id,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      roleId: schema.teamRoles.id,
      roleName: schema.teamRoles.name,
      roleSlug: schema.teamRoles.slug,
      role: schema.teamRoles.slug,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(eq(schema.teamMembers.teamId, teamId));

  return c.json({ members });
});

app.patch("/teams/:teamId/members/:memberId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const memberId = c.req.param("memberId");
  const body = updateTeamMemberRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    const role = await updateTeamMemberRole(
      db,
      teamId,
      memberId,
      body.data.roleId,
      result.auth.userId,
    );
    return c.json({ role });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update member role";
    const status =
      message === "Permission denied" ||
      message === "Team access denied" ||
      message === "Member not found" ||
      message === "Role not found" ||
      message === "Cannot remove the last admin"
        ? 403
        : 400;
    return c.json({ error: message }, status);
  }
});

app.delete("/teams/:teamId/members/:memberId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const memberId = c.req.param("memberId");

  try {
    if (memberId === "me") {
      await leaveTeam(db, teamId, result.auth.userId);
    } else {
      await removeTeamMember(db, teamId, memberId, result.auth.userId);
    }
    return c.body(null, 204);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove member";
    const status =
      message === "Team access denied" ||
      message === "Admin access required" ||
      message === "Permission denied"
        ? 403
        : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/teams/:teamId/invites", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "team.invites.manage"))) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const invites = await listTeamInvites(db, teamId);
  return c.json({ invites });
});

app.post("/teams/:teamId/invites", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "team.invites.manage"))) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const body = createTeamInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const invite = await createTeamInvite(db, {
    teamId,
    createdByUserId: result.auth.userId,
    roleId: body.data.roleId,
    role: body.data.role,
    expiresInDays: body.data.expiresInDays,
    maxUses: body.data.maxUses,
  });

  return c.json({ invite }, 201);
});

app.delete("/teams/:teamId/invites/:inviteId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const inviteId = c.req.param("inviteId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "team.invites.manage"))) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const invite = await revokeTeamInvite(db, teamId, inviteId);
  if (!invite) return c.json({ error: "Invite not found" }, 404);

  return c.body(null, 204);
});

app.get("/teams/:teamId/permissions/me", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const permissions = await getTeamPermissionsForUser(db, result.auth.userId, teamId);
  if (!permissions) {
    return c.json({ error: "Team access denied" }, 403);
  }

  return c.json({ permissions });
});

app.get("/teams/:teamId/roles", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "team.roles.view"))) {
    const canAssignRoles = await userHasTeamPermission(
      db,
      result.auth.userId,
      teamId,
      "team.members.manage",
    );
    const canInvite = await userHasTeamPermission(
      db,
      result.auth.userId,
      teamId,
      "team.invites.manage",
    );
    if (!canAssignRoles && !canInvite) {
      return c.json({ error: "Permission denied" }, 403);
    }
  }

  const roles = await listTeamRoles(db, teamId);
  return c.json({ roles });
});

app.post("/teams/:teamId/roles", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = createTeamRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    const role = await createTeamRole(db, teamId, result.auth.userId, body.data);
    return c.json({ role }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create role";
    const status = message === "Permission denied" ? 403 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch("/teams/:teamId/roles/:roleId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const roleId = c.req.param("roleId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = updateTeamRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    const role = await updateTeamRole(db, teamId, roleId, result.auth.userId, body.data);
    return c.json({ role });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update role";
    const status =
      message === "Permission denied" || message === "Role not found" ? 403 : 400;
    return c.json({ error: message }, status);
  }
});

app.delete("/teams/:teamId/roles/:roleId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const roleId = c.req.param("roleId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    await deleteTeamRole(db, teamId, roleId, result.auth.userId);
    return c.body(null, 204);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete role";
    const status =
      message === "Permission denied" ||
      message === "Role not found" ||
      message === "System roles cannot be deleted"
        ? 403
        : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/integrations/discord/bot-config", async (c) => {
  try {
    assertBotConfigKey(c.req.header("X-Teamflow-Bot-Key"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = message === "Bot config endpoint is disabled" ? 503 : 401;
    return c.json({ error: message }, status);
  }

  const config = await getDiscordBotRuntimeConfig(db);
  if (!config) {
    return c.json({ error: "Discord bot secrets are not configured in Settings" }, 404);
  }

  return c.json({ config });
});

app.get("/teams/:teamId/discord-settings", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "integrations.discord.view"))) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const settings = await getTeamDiscordSettings(db, teamId);
  return c.json({ settings });
});

app.patch("/teams/:teamId/discord-settings", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = updateTeamDiscordSettingsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    const settings = await updateTeamDiscordSettings(
      db,
      teamId,
      result.auth.userId,
      body.data,
    );
    return c.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update Discord settings";
    const status =
      message === "Permission denied" ||
      message === "Admin access required" ||
      message === "Team access denied"
        ? 403
        : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/teams/:teamId/integrations/discord/secrets", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }
  if (!(await userHasTeamPermission(db, result.auth.userId, teamId, "integrations.discord.secrets"))) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const secrets = await getDiscordBotSecretsPublic(db);
  return c.json({ secrets });
});

app.patch("/teams/:teamId/integrations/discord/secrets", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = updateDiscordBotSecretsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  try {
    const secrets = await updateDiscordBotSecrets(
      db,
      teamId,
      result.auth.userId,
      body.data,
    );
    return c.json({ secrets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update Discord secrets";
    const status = message === "Permission denied" ? 403 : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/discord/guilds/:guildId/config", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const guildId = c.req.param("guildId");
  try {
    const config = await getDiscordGuildConfig(db, guildId, result.auth.userId);
    if (!config) return c.json({ error: "Discord server not linked to a team" }, 404);
    return c.json({ config });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Discord config";
    const status = message === "Team access denied" ? 403 : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/invites/:token", async (c) => {
  const token = c.req.param("token");
  const authHeader = c.req.header("Authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await resolveAuth(db, authHeader);
    userId = auth?.userId;
  }

  const preview = await getInvitePreview(db, token, userId);
  if (!preview) return c.json({ error: "Invite not found" }, 404);

  return c.json({ preview });
});

app.post("/invites/:token/accept", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const token = c.req.param("token");
  try {
    const outcome = await acceptTeamInvite(db, token, result.auth.userId);
    return c.json(outcome);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to accept invite" },
      400,
    );
  }
});

app.get("/teams/:teamId/resolve", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const ref = c.req.query("ref") ?? "";
  const parsed = resolveRefSchema.safeParse({ ref });
  if (!parsed.success) {
    return c.json({ error: "Invalid ref query parameter" }, 400);
  }

  const match = await resolveTeamRefDetailed(db, teamId, parsed.data.ref);
  if (!match) {
    return c.json({ error: "Reference not found" }, 404);
  }

  return c.json(match);
});

app.get("/teams/:teamId/files", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const trash = c.req.query("trash") === "1";
  const files = await listTeamFiles(db, teamId, { trash });
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  return c.json({ files, totalBytes, fileCount: files.length, trash });
});

app.delete("/teams/:teamId/files/:fileId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const fileId = c.req.param("fileId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const deleted = await softDeleteTeamFile(db, teamId, fileId);
    return c.json(deleted);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 404);
    }
    throw error;
  }
});

app.post("/teams/:teamId/files/:fileId/restore", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  const fileId = c.req.param("fileId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const restored = await restoreTeamFile(db, teamId, fileId);
    return c.json(restored);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 404);
    }
    throw error;
  }
});

app.post("/teams/:teamId/rows", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const teamId = c.req.param("teamId");
  if (!(await userHasTeamAccess(db, result.auth.userId, teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = createBoardRowSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const existing = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId));
  const position = existing.length;

  const id = await createBoardRowWithKey(db, teamId, body.data.name, position);

  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, id))
    .limit(1);

  return c.json({ row: await mapBoardRow(db, row!) }, 201);
});

app.patch("/rows/:rowId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const [existing] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!existing) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = updateBoardRowSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  if (
    body.data.name === undefined &&
    body.data.position === undefined &&
    body.data.assigneeId === undefined &&
    body.data.assigneeIds === undefined &&
    body.data.color === undefined
  ) {
    return c.json({ error: "No updates provided" }, 400);
  }

  if (body.data.name !== undefined) {
    await db
      .update(schema.boardRows)
      .set({ name: body.data.name })
      .where(eq(schema.boardRows.id, rowId));
  }

  if (body.data.assigneeIds !== undefined) {
    const validIds = await filterValidTeamMemberIds(
      db,
      existing.teamId,
      body.data.assigneeIds,
    );
    await setBoardRowAssignees(db, rowId, validIds);
  } else if (body.data.assigneeId !== undefined) {
    const validIds =
      body.data.assigneeId === null
        ? []
        : await filterValidTeamMemberIds(db, existing.teamId, [body.data.assigneeId]);
    await setBoardRowAssignees(db, rowId, validIds);
  }

  if (body.data.color !== undefined) {
    await db
      .update(schema.boardRows)
      .set({ color: body.data.color })
      .where(eq(schema.boardRows.id, rowId));
  }

  if (body.data.position !== undefined) {
    const teamRows = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.teamId, existing.teamId));
    teamRows.sort((a, b) => a.position - b.position);

    const fromIndex = teamRows.findIndex((row) => row.id === rowId);
    if (fromIndex === -1) {
      return c.json({ error: "Row not found" }, 404);
    }

    const targetIndex = Math.min(body.data.position, teamRows.length - 1);
    const [moved] = teamRows.splice(fromIndex, 1);
    teamRows.splice(targetIndex, 0, moved);

    for (let index = 0; index < teamRows.length; index += 1) {
      await db
        .update(schema.boardRows)
        .set({ position: index })
        .where(eq(schema.boardRows.id, teamRows[index]!.id));
    }
  }

  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  return c.json({ row: await mapBoardRow(db, row!) });
});

app.delete("/rows/:rowId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const [existing] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!existing) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const teamRows = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, existing.teamId));

  if (teamRows.length <= 1) {
    return c.json({ error: "Cannot delete the last row on the board" }, 409);
  }

  const issueCount = await countRowIssues(db, rowId);
  if (issueCount > 0) {
    return c.json({ error: "Row has issues — move or delete them first" }, 409);
  }

  await db.delete(schema.boardRows).where(eq(schema.boardRows.id, rowId));

  const remaining = teamRows
    .filter((row) => row.id !== rowId)
    .sort((a, b) => a.position - b.position);

  for (let index = 0; index < remaining.length; index += 1) {
    await db
      .update(schema.boardRows)
      .set({ position: index })
      .where(eq(schema.boardRows.id, remaining[index]!.id));
  }

  return c.body(null, 204);
});

app.get("/projects", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const teamId = c.req.query("teamId");
  const memberships = await db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, result.auth.userId));

  const allowedTeamIds = new Set(memberships.map((m) => m.teamId));
  let projects = await db.select().from(schema.projects);

  projects = projects.filter((p) => {
    if (!allowedTeamIds.has(p.teamId)) return false;
    if (teamId && p.teamId !== teamId) return false;
    return true;
  });

  return c.json({ projects });
});

app.post("/projects", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const body = createProjectSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  if (!(await userHasTeamAccess(db, result.auth.userId, body.data.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const id = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id,
    teamId: body.data.teamId,
    name: body.data.name,
    description: body.data.description,
  });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1);

  return c.json({ project }, 201);
});

app.get("/issues", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const filters = {
    teamId: c.req.query("teamId"),
    projectId: c.req.query("projectId"),
    statusId: c.req.query("statusId"),
    assigneeId: c.req.query("assigneeId"),
    rowId: c.req.query("rowId"),
    search: c.req.query("search"),
  };

  if (result.auth.patTeamId && filters.teamId && filters.teamId !== result.auth.patTeamId) {
    return c.json({ error: "Token restricted to a different team" }, 403);
  }

  const effectiveTeamId = result.auth.patTeamId ?? filters.teamId;
  const issues = await listIssuesForUser(db, result.auth.userId, {
    ...filters,
    teamId: effectiveTeamId,
  });

  return c.json({ issues });
});

app.get("/issues/:id", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const id = c.req.param("id");
  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const teamKey = await getTeamKey(db, issue.teamId);
  const comments = await db
    .select({
      id: schema.comments.id,
      issueId: schema.comments.issueId,
      authorId: schema.comments.authorId,
      body: schema.comments.body,
      createdAt: schema.comments.createdAt,
      authorName: schema.users.name,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.issueId, id));

  return c.json({
    issue: await mapIssue(db, issue, teamKey),
    comments: comments.map((row) => ({
      id: row.id,
      issueId: row.issueId,
      authorId: row.authorId,
      authorName: row.authorName,
      body: row.body,
      createdAt: row.createdAt,
    })),
  });
});

app.post("/issues", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const body = createIssueSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  if (!(await userHasTeamAccess(db, result.auth.userId, body.data.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  if (result.auth.patTeamId && result.auth.patTeamId !== body.data.teamId) {
    return c.json({ error: "Token restricted to a different team" }, 403);
  }

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, body.data.teamId))
    .limit(1);

  if (!team) return c.json({ error: "Team not found" }, 404);

  const nextNumber = team.issueCounter + 1;
  await db
    .update(schema.teams)
    .set({ issueCounter: nextNumber })
    .where(eq(schema.teams.id, team.id));

  let statusId = body.data.statusId;
  const rowId = body.data.rowId ?? (await getDefaultRowId(db, body.data.teamId));

  if (!statusId) {
    const statuses = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, rowId));
    statusId =
      statuses.find((s) => s.type === "backlog")?.id ??
      statuses.find((s) => s.type === "todo")?.id ??
      statuses[0]?.id;
  } else {
    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, statusId))
      .limit(1);
    if (!status || status.rowId !== rowId) {
      return c.json({ error: "Status does not belong to this row" }, 400);
    }
  }

  if (!statusId) {
    return c.json({ error: "No columns configured for this row" }, 400);
  }

  const issueId = crypto.randomUUID();
  const now = new Date().toISOString();

  const cellIssues = await db
    .select()
    .from(schema.issues)
    .where(
      and(
        eq(schema.issues.teamId, body.data.teamId),
        eq(schema.issues.statusId, statusId),
        eq(schema.issues.rowId, rowId),
      ),
    );
  const boardSort = cellIssues.length;

  await db.insert(schema.issues).values({
    id: issueId,
    teamId: body.data.teamId,
    projectId: body.data.projectId,
    rowId,
    number: nextNumber,
    title: body.data.title,
    description: body.data.description,
    statusId,
    priority: body.data.priority,
    assigneeId: body.data.assigneeId,
    creatorId: result.auth.userId,
    dueDate: body.data.dueDate,
    boardSort,
    updatedAt: now,
  });

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  await logActivity(db, {
    issueId,
    userId: result.auth.userId,
    action: "issue.created",
    metadata: { title: body.data.title },
    source: result.auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, team.key) }, 201);
});

app.patch("/issues/:id", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const id = c.req.param("id");
  const body = updateIssueSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const [existing] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const updates: Partial<typeof schema.issues.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.projectId !== undefined) updates.projectId = body.data.projectId;
  if (body.data.priority !== undefined) updates.priority = body.data.priority;
  if (body.data.assigneeIds !== undefined) {
    const validIds = await filterValidTeamMemberIds(
      db,
      existing.teamId,
      body.data.assigneeIds,
    );
    await setIssueAssignees(db, id, validIds);
  } else if (body.data.assigneeId !== undefined) {
    const validIds =
      body.data.assigneeId === null
        ? []
        : await filterValidTeamMemberIds(db, existing.teamId, [body.data.assigneeId]);
    await setIssueAssignees(db, id, validIds);
  }
  if (body.data.dueDate !== undefined) updates.dueDate = body.data.dueDate;
  if (body.data.rowId !== undefined) updates.rowId = body.data.rowId;

  const nextRowId = body.data.rowId ?? existing.rowId;
  if (body.data.statusId !== undefined) {
    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, body.data.statusId))
      .limit(1);
    if (!status) return c.json({ error: "Status not found" }, 404);
    if (nextRowId && status.rowId !== nextRowId) {
      return c.json({ error: "Status does not belong to this row" }, 400);
    }
    updates.statusId = body.data.statusId;
    if (status.type === "done") {
      updates.completedAt = new Date().toISOString();
    } else {
      updates.completedAt = null;
    }
  } else if (
    body.data.rowId !== undefined &&
    body.data.rowId !== existing.rowId &&
    body.data.rowId
  ) {
    const [currentStatus] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, existing.statusId))
      .limit(1);

    const targetStatuses = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, body.data.rowId));

    const mapped =
      targetStatuses.find((s) => s.type === currentStatus?.type) ??
      targetStatuses.find((s) => s.position === currentStatus?.position) ??
      targetStatuses[0];

    if (!mapped) {
      return c.json({ error: "Target row has no columns configured" }, 400);
    }

    updates.statusId = mapped.id;
    if (mapped.type === "done") {
      updates.completedAt = new Date().toISOString();
    } else {
      updates.completedAt = null;
    }
  }

  if (body.data.boardSort !== undefined) updates.boardSort = body.data.boardSort;
  if (body.data.timerActiveAt !== undefined) {
    updates.timerActiveAt = body.data.timerActiveAt;
  }
  if (body.data.timerElapsedSec !== undefined) {
    updates.timerElapsedSec = body.data.timerElapsedSec;
  }
  if (body.data.timerTargetSec !== undefined) {
    updates.timerTargetSec = body.data.timerTargetSec;
  }
  if (body.data.color !== undefined) {
    updates.color = body.data.color;
  }

  await db.update(schema.issues).set(updates).where(eq(schema.issues.id, id));

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: result.auth.userId,
    action: "issue.updated",
    metadata: body.data,
    source: result.auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

app.post("/issues/:id/complete", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const issueRowId =
    existing.rowId ?? (await getDefaultRowId(db, existing.teamId));
  const doneStatusId = await getDoneStatusId(db, issueRowId);
  if (!doneStatusId) {
    return c.json({ error: "Done status not configured" }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({
      statusId: doneStatusId,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.issues.id, id));

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: result.auth.userId,
    action: "issue.completed",
    source: result.auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

app.delete("/issues/:id", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Issue not found" }, 404);
  if (existing.deletedAt) return c.body(null, 204);
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.issues.id, id));

  await logActivity(db, {
    userId: result.auth.userId,
    action: "issue.deleted",
    metadata: { issueId: id },
    source: result.auth.source,
  });

  return c.body(null, 204);
});

app.post("/issues/:id/restore", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Issue not found" }, 404);
  if (!existing.deletedAt) {
    return c.json({ error: "Issue is not in trash" }, 400);
  }
  if (!(await userHasTeamAccess(db, result.auth.userId, existing.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(schema.issues.id, id));

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: result.auth.userId,
    action: "issue.restored",
    source: result.auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

app.post("/issues/:id/comments", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("id");
  const body = createCommentSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const commentId = crypto.randomUUID();
  await db.insert(schema.comments).values({
    id: commentId,
    issueId,
    authorId: result.auth.userId,
    body: body.data.body,
  });

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, result.auth.userId))
    .limit(1);

  return c.json(
    {
      comment: {
        id: commentId,
        issueId,
        authorId: result.auth.userId,
        authorName: user!.name,
        body: body.data.body,
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});

app.delete("/issues/:issueId/comments/:commentId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const commentId = c.req.param("commentId");

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const [comment] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .limit(1);

  if (!comment || comment.issueId !== issueId) {
    return c.json({ error: "Comment not found" }, 404);
  }

  if (comment.authorId !== result.auth.userId) {
    return c.json({ error: "You can only delete your own comments" }, 403);
  }

  await db.delete(schema.comments).where(eq(schema.comments.id, commentId));

  return c.body(null, 204);
});

function parseCreateUploadSession(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.filename !== "string" || !record.filename.trim()) return null;
  if (typeof record.totalBytes !== "number" || record.totalBytes <= 0) return null;
  return {
    filename: record.filename.trim(),
    mimeType:
      typeof record.mimeType === "string" && record.mimeType
        ? record.mimeType
        : "application/octet-stream",
    totalBytes: Math.floor(record.totalBytes),
  };
}

function parseMoveAttachment(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const targetIssueId = (body as Record<string, unknown>).targetIssueId;
  if (typeof targetIssueId !== "string" || !targetIssueId) return null;
  return { targetIssueId };
}

function parseLinkAttachment(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const fileId = (body as Record<string, unknown>).fileId;
  if (typeof fileId !== "string" || !fileId) return null;
  return { fileId };
}

async function userCanAccessUploadSession(
  userId: string,
  session: { issueId: string | null; rowId: string | null },
) {
  if (session.issueId) {
    const [issue] = await db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.id, session.issueId))
      .limit(1);
    if (!issue) return false;
    return userHasTeamAccess(db, userId, issue.teamId);
  }
  if (session.rowId) {
    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.id, session.rowId))
      .limit(1);
    if (!row) return false;
    return userHasTeamAccess(db, userId, row.teamId);
  }
  return false;
}

app.get("/issues/:issueId/attachments", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const issueId = c.req.param("issueId");
  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const attachments = await listIssueAttachments(db, issueId);
  return c.json({ attachments, limits: getAttachmentLimits() });
});

app.post("/issues/:issueId/attachments", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = await c.req.parseBody();
  const raw = body.file;
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (!(file instanceof File)) {
    return c.json({ error: "Missing file field" }, 400);
  }

  try {
    const attachment = await saveIssueAttachment(
      db,
      issueId,
      result.auth.userId,
      file,
    );
    return c.json({ attachment }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 413);
    }
    throw error;
  }
});

app.post("/issues/:issueId/uploads", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const body = parseCreateUploadSession(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const session = await createUploadSession(
      db,
      { issueId },
      result.auth.userId,
      {
        filename: body.filename,
        mimeType: body.mimeType,
        totalBytes: body.totalBytes,
      },
    );
    return c.json({ session }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 413);
    }
    throw error;
  }
});

app.get("/uploads/:sessionId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const sessionId = c.req.param("sessionId");
  const session = await getUploadSession(db, sessionId);
  if (!session) return c.json({ error: "Upload session not found" }, 404);

  if (!(await userCanAccessUploadSession(result.auth.userId, session))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  return c.json({ session });
});

app.put("/uploads/:sessionId/chunks/:index", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const sessionId = c.req.param("sessionId");
  const chunkIndex = Number.parseInt(c.req.param("index"), 10);
  if (Number.isNaN(chunkIndex)) {
    return c.json({ error: "Invalid chunk index" }, 400);
  }

  const existing = await getUploadSession(db, sessionId);
  if (!existing) return c.json({ error: "Upload session not found" }, 404);

  if (!(await userCanAccessUploadSession(result.auth.userId, existing))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const buffer = Buffer.from(await c.req.arrayBuffer());
  try {
    const session = await saveUploadChunk(db, sessionId, chunkIndex, buffer);
    return c.json({ session });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 404 | 410 | 413);
    }
    throw error;
  }
});

app.post("/uploads/:sessionId/complete", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const sessionId = c.req.param("sessionId");
  const existing = await getUploadSession(db, sessionId);
  if (!existing) return c.json({ error: "Upload session not found" }, 404);

  if (!(await userCanAccessUploadSession(result.auth.userId, existing))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const attachment = await completeUploadSession(
      db,
      sessionId,
      result.auth.userId,
    );
    return c.json({ attachment }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 404);
    }
    throw error;
  }
});

app.delete("/uploads/:sessionId", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const sessionId = c.req.param("sessionId");
  const existing = await getUploadSession(db, sessionId);
  if (!existing) return c.json({ error: "Upload session not found" }, 404);

  if (!(await userCanAccessUploadSession(result.auth.userId, existing))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  await abortUploadSession(db, sessionId);
  return c.body(null, 204);
});

app.get("/rows/:rowId/attachments", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const rowId = c.req.param("rowId");
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const attachments = await listRowAttachments(db, rowId);
  return c.json({ attachments, limits: getAttachmentLimits() });
});

app.post("/rows/:rowId/attachments", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const body = await c.req.parseBody();
  const raw = body.file;
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (!(file instanceof File)) {
    return c.json({ error: "Missing file field" }, 400);
  }

  try {
    const attachment = await saveRowAttachment(
      db,
      rowId,
      result.auth.userId,
      file,
    );
    return c.json({ attachment }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 413);
    }
    throw error;
  }
});

app.post("/rows/:rowId/uploads", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const body = parseCreateUploadSession(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const session = await createUploadSession(
      db,
      { rowId },
      result.auth.userId,
      {
        filename: body.filename,
        mimeType: body.mimeType,
        totalBytes: body.totalBytes,
      },
    );
    return c.json({ session }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 400 | 413);
    }
    throw error;
  }
});

app.delete("/rows/:rowId/attachments/:id", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const attachmentId = c.req.param("id");

  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const deleted = await deleteRowAttachment(db, rowId, attachmentId);
  if (!deleted) return c.json({ error: "Attachment not found" }, 404);

  return c.body(null, 204);
});

app.post("/rows/:rowId/attachments/link", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const rowId = c.req.param("rowId");
  const body = parseLinkAttachment(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);

  if (!row) return c.json({ error: "Row not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const fileTeamId = await getFileTeamId(db, body.fileId);
  if (!fileTeamId || fileTeamId !== row.teamId) {
    return c.json({ error: "File not found on this team" }, 404);
  }

  try {
    const attachment = await linkFileToRow(db, rowId, body.fileId);
    return c.json({ attachment }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 404);
    }
    throw error;
  }
});

app.post("/issues/:issueId/attachments/:id/move", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const linkId = c.req.param("id");
  const body = parseMoveAttachment(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const [sourceIssue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);
  const [targetIssue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, body.targetIssueId))
    .limit(1);

  if (!sourceIssue || !targetIssue) {
    return c.json({ error: "Issue not found" }, 404);
  }
  if (sourceIssue.teamId !== targetIssue.teamId) {
    return c.json({ error: "Issues must be on the same team" }, 400);
  }
  if (!(await userHasTeamAccess(db, result.auth.userId, sourceIssue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    const attachment = await moveIssueAttachment(
      db,
      linkId,
      issueId,
      body.targetIssueId,
    );
    return c.json({ attachment });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 404);
    }
    throw error;
  }
});

app.post("/issues/:issueId/attachments/link", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const body = parseLinkAttachment(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const fileTeamId = await getFileTeamId(db, body.fileId);
  if (!fileTeamId || fileTeamId !== issue.teamId) {
    return c.json({ error: "File not found on this team" }, 404);
  }

  try {
    const attachment = await linkFileToIssue(db, issueId, body.fileId);
    return c.json({ attachment }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return c.json({ error: error.message }, error.status as 404);
    }
    throw error;
  }
});

app.post("/attachments/:id/stream-token", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const linkId = c.req.param("id");
  const row = await getAttachmentForDownload(db, linkId);
  if (!row) return c.json({ error: "Attachment not found" }, 404);
  if (!row.public.canStream) {
    return c.json({ error: "This file cannot be streamed" }, 400);
  }
  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const token = await signStreamToken(linkId, result.auth.userId);
  return c.json({
    token,
    expiresAt: streamTokenExpiresAt(),
    streamUrl: `/attachments/${linkId}/stream?token=${encodeURIComponent(token)}`,
  });
});

app.get("/attachments/:id/stream", async (c) => {
  const linkId = c.req.param("id");
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing stream token" }, 401);

  let userId: string;
  try {
    const verified = await verifyStreamToken(token);
    if (verified.linkId !== linkId) {
      return c.json({ error: "Invalid stream token" }, 401);
    }
    userId = verified.userId;
  } catch {
    return c.json({ error: "Invalid or expired stream token" }, 401);
  }

  const row = await getAttachmentForDownload(db, linkId);
  if (!row) return c.json({ error: "Attachment not found" }, 404);
  if (!(await userHasTeamAccess(db, userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    return await createFileRangeResponse(row.fullPath, {
      mimeType: row.mimeType,
      filename: row.filename,
      inline: true,
      rangeHeader: c.req.header("range"),
    });
  } catch {
    return c.json({ error: "File missing on server" }, 404);
  }
});

app.get("/attachments/:id/download", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;

  const linkId = c.req.param("id");
  const row = await getAttachmentForDownload(db, linkId);
  if (!row) return c.json({ error: "Attachment not found" }, 404);

  if (!(await userHasTeamAccess(db, result.auth.userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  try {
    return await createFileRangeResponse(row.fullPath, {
      mimeType: row.mimeType,
      filename: row.filename,
      inline: false,
      rangeHeader: c.req.header("range"),
    });
  } catch {
    return c.json({ error: "File missing on server" }, 404);
  }
});

app.delete("/issues/:issueId/attachments/:id", async (c) => {
  const result = await requireAuth(c);
  if ("error" in result) return result.error;
  requireWrite(result.auth);

  const issueId = c.req.param("issueId");
  const attachmentId = c.req.param("id");

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);
  if (!(await userHasTeamAccess(db, result.auth.userId, issue.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

  const deleted = await deleteIssueAttachment(db, issueId, attachmentId);
  if (!deleted) return c.json({ error: "Attachment not found" }, 404);

  return c.body(null, 204);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist =
  process.env.WEB_DIST ??
  path.resolve(__dirname, "..", "..", "web", "dist");
const serveWeb =
  process.env.SERVE_WEB === "true" ||
  (process.env.NODE_ENV === "production" && fs.existsSync(webDist));

const apiPathPrefixes = [
  "/health",
  "/auth",
  "/teams",
  "/invites",
  "/projects",
  "/issues",
  "/attachments",
  "/uploads",
  "/statuses",
  "/rows",
];

function isApiPath(pathname: string) {
  return apiPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

if (serveWeb) {
  app.use("/assets/*", serveStatic({ root: webDist }));
  app.get("/", serveStatic({ root: webDist, path: "index.html" }));
  app.get("*", async (c, next) => {
    if (isApiPath(c.req.path)) {
      return next();
    }
    return serveStatic({ root: webDist, path: "index.html" })(c, next);
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

console.log(`Teamflow API listening on http://${host}:${port}`);

serve({ fetch: app.fetch, port, hostname: host });
