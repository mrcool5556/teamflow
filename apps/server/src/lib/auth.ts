import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { TokenScope, UserPublic } from "@teamflow/core";
import { config } from "../config.js";
import { forbidden } from "./errors.js";

// Secret validation lives in config.ts (it runs at boot); re-exported here for existing callers.
export {
  PLACEHOLDER_SECRETS,
  devSecretsAllowed,
  isPlaceholderSecret,
  resolveSecret,
} from "../config.js";

const JWT_ISSUER = "teamflow";
const JWT_AUDIENCE = "teamflow-web";

let cachedJwtSecret: Uint8Array | null = null;
let cachedJwtSource: string | undefined;

/** The validated JWT secret as key bytes (config.jwtSecret is refused at boot if unsafe). */
export function getJwtSecret() {
  const raw = config.jwtSecret;
  if (!cachedJwtSecret || cachedJwtSource !== raw) {
    cachedJwtSecret = new TextEncoder().encode(raw);
    cachedJwtSource = raw;
  }
  return cachedJwtSecret;
}

export function toUserPublic(user: typeof schema.users.$inferSelect): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    isInstanceAdmin: user.isInstanceAdmin === 1,
  };
}

/** Emails listed in TEAMFLOW_INSTANCE_ADMINS (comma-separated, case-insensitive). */
export function instanceAdminEmailsFromEnv(): Set<string> {
  return new Set(config.instanceAdminEmails);
}

/**
 * Persist the instance-admin flag for a user if their email is listed in
 * TEAMFLOW_INSTANCE_ADMINS. Called at login and registration. Returns the current flag.
 */
export async function syncInstanceAdminFromEnv(db: Db, user: typeof schema.users.$inferSelect) {
  if (user.isInstanceAdmin === 1) return true;
  if (!instanceAdminEmailsFromEnv().has(user.email.toLowerCase())) return false;
  await db.update(schema.users).set({ isInstanceAdmin: 1 }).where(eq(schema.users.id, user.id));
  user.isInstanceAdmin = 1;
  return true;
}

export async function userIsInstanceAdmin(db: Db, userId: string) {
  const [row] = await db
    .select({ isInstanceAdmin: schema.users.isInstanceAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.isInstanceAdmin === 1;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(userId: string, tokenVersion = 0) {
  return new SignJWT({ sub: userId, type: "session", ver: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (payload.type !== "session" || typeof payload.sub !== "string") {
    throw new Error("Invalid session token");
  }
  // Tokens issued before token_version existed carry no `ver`; treat them as version 0.
  const tokenVersion = typeof payload.ver === "number" ? payload.ver : 0;
  return { userId: payload.sub, tokenVersion };
}

export function generatePat() {
  const raw = `pat_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

export function hashPat(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export type AuthContext = {
  userId: string;
  authType: "session" | "pat";
  scopes: TokenScope[];
  patTeamId?: string | null;
  source: string;
};

export async function resolveAuth(
  db: Db,
  authorizationHeader: string | undefined,
): Promise<AuthContext | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  if (token.startsWith("pat_")) {
    const tokenHash = hashPat(token);
    const rows = await db
      .select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    await db
      .update(schema.apiTokens)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(schema.apiTokens.id, row.id));

    return {
      userId: row.userId,
      authType: "pat",
      scopes: JSON.parse(row.scopes) as TokenScope[],
      patTeamId: row.teamId,
      source: "pat",
    };
  }

  try {
    const { userId, tokenVersion } = await verifySessionToken(token);
    const [user] = await db
      .select({ tokenVersion: schema.users.tokenVersion })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    // A password reset bumps token_version, which invalidates every earlier session.
    if (!user || user.tokenVersion !== tokenVersion) return null;
    return {
      userId,
      authType: "session",
      scopes: ["read", "write"],
      source: "session",
    };
  } catch {
    return null;
  }
}

export function requireWrite(auth: AuthContext) {
  if (!auth.scopes.includes("write")) {
    throw forbidden("Token does not have write scope");
  }
}

/** Append an activity row (synchronous so it can run inside db.transaction). */
export function logActivity(
  db: DbExecutor,
  input: {
    issueId?: string;
    userId?: string;
    action: string;
    metadata?: Record<string, unknown>;
    source?: string;
  },
) {
  db.insert(schema.activity)
    .values({
      issueId: input.issueId,
      userId: input.userId,
      action: input.action,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      source: input.source ?? "api",
    })
    .run();
}
