import { eq, sql } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userIsTeamAdmin } from "./invites.js";

export function personalWorkspaceSlug(userId: string) {
  return `ws-${userId.slice(0, 8)}`;
}

export async function getOrCreatePersonalWorkspace(
  db: Db,
  userId: string,
  userName = "User",
) {
  const slug = personalWorkspaceSlug(userId);
  const [existing] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const workspaceId = crypto.randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: `${userName}'s Workspace`,
    slug,
  });

  return workspaceId;
}

export async function countUserTeams(db: Db, userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));
  return Number(row?.count ?? 0);
}

export async function deleteTeam(db: Db, teamId: string, actorUserId: string) {
  if (!(await userIsTeamAdmin(db, actorUserId, teamId))) {
    throw new Error("Admin access required");
  }

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);

  if (!team) {
    throw new Error("Team not found");
  }

  await db.delete(schema.teams).where(eq(schema.teams.id, teamId));

  return team;
}

export async function createTeamForUser(
  db: Db,
  input: {
    userId: string;
    userName: string;
    name: string;
    key: string;
  },
) {
  const workspaceId = await getOrCreatePersonalWorkspace(db, input.userId, input.userName);

  const teamId = crypto.randomUUID();
  await db.insert(schema.teams).values({
    id: teamId,
    workspaceId,
    name: input.name,
    key: input.key,
  });

  await db.insert(schema.teamMembers).values({
    teamId,
    userId: input.userId,
    role: "admin",
  });

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);

  return team!;
}
