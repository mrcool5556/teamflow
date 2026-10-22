import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { TeamInvitePublic, TeamInvitePreview, TeamPublic, TeamRole } from "@teamflow/core";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamAccess } from "./issues.js";
import { getTeamMemberWithRole } from "./permissions.js";
import { resolveInviteRoleId } from "./roles.js";
import { config } from "../config.js";
import { badRequest, forbidden, notFound } from "./errors.js";

const DEFAULT_INVITE_DAYS = 30;

export function generateInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function defaultInviteExpiry(days = DEFAULT_INVITE_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isInviteExhausted(invite: { maxUses: number | null; useCount: number }) {
  return invite.maxUses != null && invite.useCount >= invite.maxUses;
}

export function isInviteActive(invite: typeof schema.teamInvites.$inferSelect) {
  if (invite.revokedAt) return false;
  if (isInviteExhausted(invite)) return false;
  return new Date(invite.expiresAt).getTime() > Date.now();
}

function mapInvitePublic(
  invite: typeof schema.teamInvites.$inferSelect,
  createdByName: string,
  role: { id: string; name: string; slug: string },
): TeamInvitePublic {
  const exhausted = isInviteExhausted(invite);
  return {
    id: invite.id,
    teamId: invite.teamId,
    token: invite.token,
    roleId: role.id,
    roleName: role.name,
    roleSlug: role.slug,
    role: role.slug as TeamRole,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    createdByName,
    revoked: Boolean(invite.revokedAt),
    expired: new Date(invite.expiresAt).getTime() <= Date.now(),
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    exhausted,
  };
}

export async function listTeamInvites(db: Db, teamId: string) {
  const rows = await db
    .select({
      invite: schema.teamInvites,
      createdByName: schema.users.name,
      roleId: schema.teamRoles.id,
      roleName: schema.teamRoles.name,
      roleSlug: schema.teamRoles.slug,
    })
    .from(schema.teamInvites)
    .innerJoin(schema.users, eq(schema.teamInvites.createdByUserId, schema.users.id))
    .innerJoin(schema.teamRoles, eq(schema.teamInvites.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamInvites.teamId, teamId), isNull(schema.teamInvites.revokedAt)));

  return rows
    .map((row) =>
      mapInvitePublic(row.invite, row.createdByName, {
        id: row.roleId,
        name: row.roleName,
        slug: row.roleSlug,
      }),
    )
    .filter((invite) => !invite.expired && !invite.exhausted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTeamInvite(
  db: Db,
  input: {
    teamId: string;
    createdByUserId: string;
    roleId?: string;
    role?: TeamRole;
    expiresInDays?: number;
    maxUses?: number | null;
  },
) {
  const token = generateInviteToken();
  const expiresAt = defaultInviteExpiry(input.expiresInDays);
  const maxUses = input.maxUses === undefined ? 1 : input.maxUses;
  const role = await resolveInviteRoleId(db, input.teamId, {
    roleId: input.roleId,
    role: input.role,
  });

  // An invite may not carry a role ranked above the inviter's (lower position = higher rank).
  const inviter = await getTeamMemberWithRole(db, input.createdByUserId, input.teamId);
  if (!inviter) throw forbidden("Team access denied");
  const outranksInviter =
    role.position < inviter.role.position ||
    (role.slug === "owner" && inviter.role.slug !== "owner");
  if (outranksInviter) {
    throw forbidden("Cannot invite with a role above your own");
  }

  await db.insert(schema.teamInvites).values({
    teamId: input.teamId,
    token,
    roleId: role.id,
    role: role.slug,
    createdByUserId: input.createdByUserId,
    expiresAt,
    maxUses,
  });

  const [invite] = await db
    .select()
    .from(schema.teamInvites)
    .where(eq(schema.teamInvites.token, token))
    .limit(1);

  const [creator] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, input.createdByUserId))
    .limit(1);

  return mapInvitePublic(invite!, creator?.name ?? "Unknown", {
    id: role.id,
    name: role.name,
    slug: role.slug,
  });
}

export async function revokeTeamInvite(db: Db, teamId: string, inviteId: string) {
  const [invite] = await db
    .select()
    .from(schema.teamInvites)
    .where(and(eq(schema.teamInvites.id, inviteId), eq(schema.teamInvites.teamId, teamId)))
    .limit(1);

  if (!invite) return null;

  await db
    .update(schema.teamInvites)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(schema.teamInvites.id, inviteId));

  return invite;
}

function loadInviteRow(db: DbExecutor, token: string) {
  const row = db
    .select({
      invite: schema.teamInvites,
      team: schema.teams,
      roleId: schema.teamRoles.id,
      roleName: schema.teamRoles.name,
      roleSlug: schema.teamRoles.slug,
    })
    .from(schema.teamInvites)
    .innerJoin(schema.teams, eq(schema.teamInvites.teamId, schema.teams.id))
    .innerJoin(schema.teamRoles, eq(schema.teamInvites.roleId, schema.teamRoles.id))
    .where(eq(schema.teamInvites.token, token))
    .get();

  return row ?? null;
}

function inviteAcceptError(row: NonNullable<Awaited<ReturnType<typeof loadInviteRow>>>) {
  if (row.invite.revokedAt) {
    return "Invite has been revoked";
  }
  if (new Date(row.invite.expiresAt).getTime() <= Date.now()) {
    return "Invite has expired";
  }
  if (isInviteExhausted(row.invite)) {
    return "Invite has already been used";
  }
  return null;
}

export async function getInvitePreview(
  db: Db,
  token: string,
  userId?: string,
): Promise<TeamInvitePreview | null> {
  const row = loadInviteRow(db, token);
  if (!row) return null;

  let alreadyMember = false;
  if (userId) {
    alreadyMember = await userHasTeamAccess(db, userId, row.team.id);
  }

  return {
    team: {
      id: row.team.id,
      name: row.team.name,
      key: row.team.key,
    },
    roleId: row.roleId,
    roleName: row.roleName,
    roleSlug: row.roleSlug,
    role: row.roleSlug as TeamRole,
    expired: new Date(row.invite.expiresAt).getTime() <= Date.now(),
    revoked: Boolean(row.invite.revokedAt),
    exhausted: isInviteExhausted(row.invite),
    alreadyMember,
  };
}

export function assertInviteAcceptable(db: DbExecutor, token: string) {
  const row = loadInviteRow(db, token);
  if (!row) {
    throw notFound("Invite not found");
  }
  const error = inviteAcceptError(row);
  if (error) {
    throw badRequest(error);
  }
  return row;
}

function recordInviteUse(db: DbExecutor, inviteId: string) {
  db.update(schema.teamInvites)
    .set({ useCount: sql`${schema.teamInvites.useCount} + 1` })
    .where(eq(schema.teamInvites.id, inviteId))
    .run();
}

/**
 * Join the invite's team. Synchronous and wrapped in a transaction (joining the caller's own
 * transaction when given one), so the membership and the use count change together and two
 * concurrent accepts cannot both use a single-use invite.
 */
export function acceptTeamInvite(
  db: DbExecutor,
  token: string,
  userId: string,
): { team: TeamPublic; alreadyMember: boolean } {
  const run = (tx: DbExecutor) => {
    const row = assertInviteAcceptable(tx, token);

    const alreadyMember = userHasTeamAccess(tx, userId, row.team.id);
    if (!alreadyMember) {
      tx.insert(schema.teamMembers)
        .values({ teamId: row.team.id, userId, roleId: row.roleId, role: row.roleSlug })
        .run();
      recordInviteUse(tx, row.invite.id);
    }
    return { row, alreadyMember };
  };
  const { row, alreadyMember } = db.transaction((tx) => run(tx));

  return {
    team: {
      id: row.team.id,
      workspaceId: row.team.workspaceId,
      name: row.team.name,
      key: row.team.key,
      createdAt: row.team.createdAt,
    },
    alreadyMember,
  };
}

export function isInviteOnlyRegistration() {
  return config.inviteOnly;
}

export { userIsTeamAdmin } from "./permissions.js";
