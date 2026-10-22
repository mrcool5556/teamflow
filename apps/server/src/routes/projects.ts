import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseQuery } from "../lib/validation.js";
import { createProjectSchema, listProjectsQuerySchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess } from "../middleware/team.js";

/** Projects. */
const routes = new Hono<AppEnv>();

routes.get("/projects", requireAuth, async (c) => {
  const auth = c.var.auth;

  const { teamId } = parseQuery(c, listProjectsQuerySchema);

  // Only projects of teams the caller belongs to; a team-scoped PAT sees only its team.
  const memberTeams = db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, auth.userId));
  const conditions = [inArray(schema.projects.teamId, memberTeams)];
  if (auth.patTeamId) conditions.push(eq(schema.projects.teamId, auth.patTeamId));
  if (teamId) conditions.push(eq(schema.projects.teamId, teamId));

  const projects = await db
    .select()
    .from(schema.projects)
    .where(and(...conditions));

  return c.json({ projects });
});

routes.post("/projects", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = await parseBody(c, createProjectSchema);

  await assertTeamAccess(auth, body.teamId);

  const id = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id,
    teamId: body.teamId,
    name: body.name,
    description: body.description,
  });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1);

  return c.json({ project }, 201);
});

export { routes as projectsRoutes };
