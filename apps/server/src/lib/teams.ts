import { and, eq, inArray, sql } from "drizzle-orm";
import { SPACE_ERROR_CODES, type SpaceAllowancePublic, type SpaceType } from "@teamflow/core";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamPermission } from "./permissions.js";
import { findTeamRoleBySlug, seedDefaultTeamRoles } from "./roles.js";
import { createDefaultBoardRow } from "./board.js";
import { removeStoredFilesFromDisk } from "./attachments.js";
import { ApiError, forbidden, internalError, notFound } from "./errors.js";
import { getSpaceSettings } from "./spaceSettings.js";

export function personalWorkspaceSlug(userId: string) {
  return `ws-${userId.slice(0, 8)}`;
}

export function getOrCreatePersonalWorkspace(db: DbExecutor, userId: string, userName = "User") {
  const slug = personalWorkspaceSlug(userId);
  const existing = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .get();

  if (existing) {
    return existing.id;
  }

  const workspaceId = crypto.randomUUID();
  db.insert(schema.workspaces)
    .values({ id: workspaceId, name: `${userName}'s Workspace`, slug })
    .run();

  return workspaceId;
}

/**
 * Create a team with its system roles, the given member as `role`, and a default board row.
 * Synchronous: callers run it inside db.transaction so a failure leaves nothing behind.
 */
export type NewSpace = {
  spaceType: SpaceType;
  /** null = no limit. */
  storageCapBytes: number | null;
  /** The account a free space counts against. */
  spaceOwnerId: string | null;
};

export function createTeamWithOwner(
  db: DbExecutor,
  input: {
    userId: string;
    userName: string;
    name: string;
    key: string;
    role: "owner" | "admin";
    /** Omitted: an admin space with no cap (what every team was before spaces). */
    space?: NewSpace;
  },
) {
  const workspaceId = getOrCreatePersonalWorkspace(db, input.userId, input.userName);

  const teamId = crypto.randomUUID();
  const space = input.space ?? { spaceType: "admin", storageCapBytes: null, spaceOwnerId: null };
  db.insert(schema.teams)
    .values({ id: teamId, workspaceId, name: input.name, key: input.key, ...space })
    .run();

  seedDefaultTeamRoles(db, teamId);
  const role = findTeamRoleBySlug(db, teamId, input.role);
  if (!role) {
    throw internalError("Failed to seed team roles");
  }

  db.insert(schema.teamMembers)
    .values({ teamId, userId: input.userId, roleId: role.id, role: role.slug })
    .run();

  createDefaultBoardRow(db, teamId);

  return db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).get()!;
}

/** Free spaces (free Flows) counting against `userId` (an older account's General included). */
export function countOwnedFreeSpaces(db: DbExecutor, userId: string) {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teams)
    .where(and(eq(schema.teams.spaceOwnerId, userId), eq(schema.teams.spaceType, "free")))
    .get();
  return Number(row?.count ?? 0);
}

/**
 * The space a Flow a user makes for themselves gets (Create a Flow, New Flow). Instance admins
 * make admin spaces with no cap; everyone else makes free spaces with the free-space cap, at most
 * `freeSpacesPerUser` of them. A user's first free space is never refused, so a new account can
 * always start even with a limit of 0; `firstSpace` forces that exemption.
 */
export function spaceForUserCreatedTeam(
  db: DbExecutor,
  input: { userId: string; isInstanceAdmin: boolean; firstSpace?: boolean },
): NewSpace {
  if (input.isInstanceAdmin) {
    return { spaceType: "admin", storageCapBytes: null, spaceOwnerId: input.userId };
  }
  const settings = getSpaceSettings(db);
  if (!input.firstSpace) {
    const owned = countOwnedFreeSpaces(db, input.userId);
    if (owned > 0 && owned >= settings.freeSpacesPerUser) {
      throw new ApiError(
        409,
        `You already own ${owned} free Flow${owned === 1 ? "" : "s"}, the most allowed. ` +
          "Delete one you no longer need, or ask a server admin to make one for you.",
        SPACE_ERROR_CODES.freeSpaceLimit,
        { owned, limit: settings.freeSpacesPerUser },
      );
    }
  }
  return {
    spaceType: "free",
    storageCapBytes: settings.freeSpaceCapBytes,
    spaceOwnerId: input.userId,
  };
}

/** How many free spaces the user owns and may still make (Create a Flow). */
export function getSpaceAllowance(
  db: DbExecutor,
  input: { userId: string; isInstanceAdmin: boolean },
): SpaceAllowancePublic {
  const settings = getSpaceSettings(db);
  const owned = countOwnedFreeSpaces(db, input.userId);
  return {
    unlimited: input.isInstanceAdmin,
    owned,
    limit: settings.freeSpacesPerUser,
    capBytes: settings.freeSpaceCapBytes,
    canCreate: input.isInstanceAdmin || owned === 0 || owned < settings.freeSpacesPerUser,
  };
}

export async function countUserTeams(db: Db, userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));
  return Number(row?.count ?? 0);
}

/**
 * Delete a team (Flow) for good with its files. `byServerOwner`: the Server Owner deleting it
 * from Server admin, who need not be a member (the route checks the Owner).
 */
export async function deleteTeam(
  db: Db,
  teamId: string,
  actorUserId: string,
  options: { byServerOwner?: boolean } = {},
) {
  if (
    !options.byServerOwner &&
    !(await userHasTeamPermission(db, actorUserId, teamId, "team.delete"))
  ) {
    throw forbidden("Permission denied");
  }

  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);

  if (!team) {
    throw notFound("Team not found");
  }

  const storagePaths = db.transaction((tx) => {
    const files = listTeamOnlyStoredFiles(tx, teamId);

    // team_members.role_id and team_invites.role_id reference team_roles ON DELETE RESTRICT,
    // so the cascade from teams to team_roles is refused while either still exists.
    tx.delete(schema.teamInvites).where(eq(schema.teamInvites.teamId, teamId)).run();
    tx.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId)).run();
    tx.delete(schema.teams).where(eq(schema.teams.id, teamId)).run();

    // stored_files has no team column, so the cascade only removes its links.
    if (files.length > 0) {
      tx.delete(schema.storedFiles)
        .where(
          inArray(
            schema.storedFiles.id,
            files.map((f) => f.id),
          ),
        )
        .run();
    }
    return files.map((f) => f.storagePath);
  });

  await removeStoredFilesFromDisk(storagePaths);

  return team;
}

/** Stored files linked to the team's issues or rows and to no other team's. */
function listTeamOnlyStoredFiles(db: DbExecutor, teamId: string) {
  const fileLinksWithTeam = (fileIds?: string[]) => [
    ...db
      .select({ fileId: schema.issueFileLinks.fileId, teamId: schema.issues.teamId })
      .from(schema.issueFileLinks)
      .innerJoin(schema.issues, eq(schema.issues.id, schema.issueFileLinks.issueId))
      .where(
        fileIds ? inArray(schema.issueFileLinks.fileId, fileIds) : eq(schema.issues.teamId, teamId),
      )
      .all(),
    ...db
      .select({ fileId: schema.rowFileLinks.fileId, teamId: schema.boardRows.teamId })
      .from(schema.rowFileLinks)
      .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.rowFileLinks.rowId))
      .where(
        fileIds
          ? inArray(schema.rowFileLinks.fileId, fileIds)
          : eq(schema.boardRows.teamId, teamId),
      )
      .all(),
  ];

  const teamFileIds = [...new Set(fileLinksWithTeam().map((l) => l.fileId))];
  if (teamFileIds.length === 0) return [];
  const linkedElsewhere = new Set(
    fileLinksWithTeam(teamFileIds)
      .filter((l) => l.teamId !== teamId)
      .map((l) => l.fileId),
  );
  const fileIds = teamFileIds.filter((id) => !linkedElsewhere.has(id));
  if (fileIds.length === 0) return [];

  return db
    .select({ id: schema.storedFiles.id, storagePath: schema.storedFiles.storagePath })
    .from(schema.storedFiles)
    .where(inArray(schema.storedFiles.id, fileIds))
    .all();
}
