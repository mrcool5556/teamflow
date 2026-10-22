import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createProjectSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess, patTeamMismatch } from "../middleware/team.js";

/** Projects. */
const routes = new Hono<AppEnv>();

routes.get("/projects", requireAuth, async (c) => {
  const auth = c.var.auth;

  const teamId = c.req.query("teamId");
  const memberships = await db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, auth.userId));

  const allowedTeamIds = new Set(memberships.map((m) => m.teamId));
  let projects = await db.select().from(schema.projects);

  projects = projects.filter((p) => {
    if (!allowedTeamIds.has(p.teamId)) return false;
    if (patTeamMismatch(auth, p.teamId)) return false;
    if (teamId && p.teamId !== teamId) return false;
    return true;
  });

  return c.json({ projects });
});

routes.post("/projects", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = createProjectSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  await assertTeamAccess(auth, body.data.teamId);

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

export { routes as projectsRoutes };
