import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { getPublicBaseUrl, isSmtpConfigured, sendPasswordResetEmail } from "./mail.js";
import { hashPassword } from "./auth.js";

const RESET_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildResetUrl(token: string) {
  const base = getPublicBaseUrl();
  const url = new URL(base);
  url.searchParams.set("reset", token);
  return url.toString();
}

export function getPasswordResetAuthConfig() {
  return { passwordResetEmail: isSmtpConfigured() };
}

export async function requestPasswordReset(db: Db, email: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user) {
    return {
      message:
        "If an account exists for that email, password reset instructions have been sent.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.passwordResetTokens.userId, user.id),
        isNull(schema.passwordResetTokens.usedAt),
      ),
    );

  await db.insert(schema.passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = buildResetUrl(token);
  const emailed = await sendPasswordResetEmail(user.email, resetUrl);

  if (!emailed) {
    console.log(
      `[teamflow] Password reset for ${user.email} (SMTP not configured): ${resetUrl}`,
    );
  }

  return {
    message: emailed
      ? "If an account exists for that email, password reset instructions have been sent."
      : "If an account exists for that email, your administrator can find the reset link in the server logs. Configure SMTP to send reset emails automatically.",
  };
}

export async function resetPasswordWithToken(db: Db, token: string, password: string) {
  const tokenHash = hashResetToken(token);
  const now = new Date().toISOString();

  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Invalid or expired reset link");
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, row.userId));

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(schema.passwordResetTokens.id, row.id));

  return { ok: true as const };
}
