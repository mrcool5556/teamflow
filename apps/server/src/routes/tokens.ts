import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createTokenSchema } from "@teamflow/core";
import type { TokenScope } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess } from "../middleware/team.js";
import { generatePat } from "../lib/auth.js";

/** Personal access tokens (list, create, revoke). */
const routes = new Hono<AppEnv>();

function toApiTokenPublic(row: typeof schema.apiTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: JSON.parse(row.scopes) as TokenScope[],
    teamId: row.teamId ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
  };
}

routes.get("/auth/tokens", requireAuth, async (c) => {
  const auth = c.var.auth;

  const rows = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, auth.userId));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json({ tokens: rows.map(toApiTokenPublic) });
});

routes.delete("/auth/tokens/:id", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, auth.userId)))
    .limit(1);
  if (!row) return c.json({ error: "Token not found" }, 404);

  await db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, id));
  return c.body(null, 204);
});

routes.post("/auth/tokens", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = createTokenSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  // A PAT can only mint tokens no broader than itself: same team scope, no new scopes.
  if (auth.authType === "pat") {
    if (auth.patTeamId && body.data.teamId !== auth.patTeamId) {
      return c.json({ error: "Token restricted to a different team" }, 403);
    }
    if (body.data.scopes.some((scope) => !auth.scopes.includes(scope))) {
      return c.json({ error: "Token cannot grant scopes it does not have" }, 403);
    }
  }

  if (body.data.teamId) {
    await assertTeamAccess(auth, body.data.teamId);
  }

  const { raw, prefix, hash } = generatePat();
  const id = crypto.randomUUID();

  await db.insert(schema.apiTokens).values({
    id,
    userId: auth.userId,
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

export { routes as tokensRoutes };
