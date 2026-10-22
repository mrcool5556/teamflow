import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { createCommentSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam } from "../middleware/team.js";

/** Issue comments. */
const routes = new Hono<AppEnv>();

routes.post(
  "/issues/:id/comments",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  async (c) => {
    const auth = c.var.auth;

    const issue = c.var.issue;
    const issueId = issue.id;
    const body = await parseBody(c, createCommentSchema);

    const commentId = crypto.randomUUID();
    await db.insert(schema.comments).values({
      id: commentId,
      issueId,
      authorId: auth.userId,
      body: body.body,
    });

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, auth.userId))
      .limit(1);

    return c.json(
      {
        comment: {
          id: commentId,
          issueId,
          authorId: auth.userId,
          authorName: user!.name,
          body: body.body,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  },
);

routes.delete(
  "/issues/:issueId/comments/:commentId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  async (c) => {
    const auth = c.var.auth;

    const issue = c.var.issue;
    const issueId = issue.id;
    const commentId = c.req.param("commentId");

    const [comment] = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, commentId))
      .limit(1);

    if (!comment || comment.issueId !== issueId) {
      return c.json({ error: "Comment not found" }, 404);
    }

    if (comment.authorId !== auth.userId) {
      return c.json({ error: "You can only delete your own comments" }, 403);
    }

    await db.delete(schema.comments).where(eq(schema.comments.id, commentId));

    return c.body(null, 204);
  },
);

export { routes as commentsRoutes };
