import { createMiddleware } from "hono/factory";
import { db } from "../db.js";
import { resolveAuth, userIsInstanceAdmin, type AuthContext } from "../lib/auth.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export type AuthVariables = {
  /** Set by requireAuth (and by optionalAuth when a valid bearer token was sent). */
  auth: AuthContext;
};

/** Resolve the bearer token (session JWT or PAT) into c.var.auth or answer 401. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = await resolveAuth(db, c.req.header("Authorization"));
  if (!auth) throw unauthorized("Unauthorized");
  c.set("auth", auth);
  await next();
});

/** Like requireAuth but anonymous requests continue with c.var.auth unset. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const auth = await resolveAuth(db, header);
    if (auth) c.set("auth", auth);
  }
  await next();
});

/** Read-only PATs may not reach mutating routes. Must follow requireAuth. */
export const requireWrite = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth.scopes.includes("write")) {
    throw forbidden("Token does not have write scope");
  }
  await next();
});

/** Server-wide actions (maintenance, bot secrets) need the instance-admin flag on the user. */
export const requireInstanceAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!(await userIsInstanceAdmin(db, c.var.auth.userId))) {
    throw forbidden("Instance admin required");
  }
  await next();
});
