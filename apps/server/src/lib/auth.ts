import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { TokenScope, UserPublic } from "@teamflow/core";

const JWT_ISSUER = "teamflow";
const JWT_AUDIENCE = "teamflow-web";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change-me-in-production-use-long-random-string") {
    console.warn("[teamflow] Warning: using default JWT_SECRET. Set JWT_SECRET in production.");
  }
  return new TextEncoder().encode(secret ?? "dev-secret");
}

export function toUserPublic(user: typeof schema.users.$inferSelect): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(userId: string) {
  return new SignJWT({ sub: userId, type: "session" })
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
  return payload.sub;
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
    const userId = await verifySessionToken(token);
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
    const error = new Error("Token does not have write scope");
    (error as Error & { status: number }).status = 403;
    throw error;
  }
}

export async function logActivity(
  db: Db,
  input: {
    issueId?: string;
    userId?: string;
    action: string;
    metadata?: Record<string, unknown>;
    source?: string;
  },
) {
  await db.insert(schema.activity).values({
    issueId: input.issueId,
    userId: input.userId,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    source: input.source ?? "api",
  });
}
