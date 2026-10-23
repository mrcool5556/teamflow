import { eq, inArray, sql } from "drizzle-orm";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamPermission } from "./permissions.js";
import { findTeamRoleBySlug, seedDefaultTeamRoles } from "./roles.js";
import { createDefaultBoardRow } from "./board.js";
import { removeStoredFilesFromDisk } from "./attachments.js";
import { forbidden, internalError, notFound } from "./errors.js";

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
export function createTeamWithOwner(
  db: DbExecutor,
  input: { userId: string; userName: string; name: string; key: string; role: "owner" | "admin" },
) {
  const workspaceId = getOrCreatePersonalWorkspace(db, input.userId, input.userName);

  const teamId = crypto.randomUUID();
  db.insert(schema.teams)
    .values({ id: teamId, workspaceId, name: input.name, key: input.key })
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

export async function countUserTeams(db: Db, userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));
  return Number(row?.count ?? 0);
}

export async function deleteTeam(db: Db, teamId: string, actorUserId: string) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.delete"))) {
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
