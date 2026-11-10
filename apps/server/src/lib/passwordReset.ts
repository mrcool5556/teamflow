import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { getPublicBaseUrl, isSmtpConfigured, sendPasswordResetEmail } from "./mail.js";
import { hashPassword } from "./auth.js";
import { config } from "../config.js";
import { badRequest, notFound } from "./errors.js";

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

const GENERIC_MESSAGE =
  "If an account exists for that email, password reset instructions have been sent.";
const NO_SMTP_MESSAGE =
  "If an account exists for that email, your administrator can issue a reset. Configure SMTP to send reset emails automatically.";

/** The response depends only on server configuration, never on whether the email exists. */
function resetResponse() {
  return { message: isSmtpConfigured() ? GENERIC_MESSAGE : NO_SMTP_MESSAGE };
}

/** A fresh one-hour reset link for the user; any older unused link stops working. */
async function issueResetToken(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(
      and(eq(schema.passwordResetTokens.userId, userId), isNull(schema.passwordResetTokens.usedAt)),
    );

  await db.insert(schema.passwordResetTokens).values({ userId, tokenHash, expiresAt });
  return { resetUrl: buildResetUrl(token), expiresAt };
}

/**
 * Server admin page → People → Send reset link. Emails it when email is set up; the link is
 * always returned too, so the admin can pass it on when email is not set up (or did not arrive).
 */
export async function issuePasswordResetForAdmin(db: Db, userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw notFound("User not found");
  const { resetUrl, expiresAt } = await issueResetToken(db, user.id);
  let emailed = false;
  let emailError: string | null = null;
  try {
    emailed = await sendPasswordResetEmail(user.email, resetUrl);
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
  }
  return { url: resetUrl, expiresAt, emailed, emailError };
}

export async function requestPasswordReset(db: Db, email: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (!user) {
    return resetResponse();
  }

  const { resetUrl } = await issueResetToken(db, user.id);
  const emailed = await sendPasswordResetEmail(user.email, resetUrl);

  if (!emailed) {
    // The link is a credential; only print it in local development.
    if (config.isDevelopment) {
      console.log(`[teamflow] Password reset for ${user.email} (SMTP not configured): ${resetUrl}`);
    } else {
      console.warn(
        "[teamflow] Password reset requested but SMTP is not configured; no email was sent. Set SMTP_* in .env.",
      );
    }
  }

  return resetResponse();
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
    throw badRequest("Invalid or expired reset link");
  }

  const passwordHash = await hashPassword(password);

  // Bumping token_version signs every existing session out.
  await db
    .update(schema.users)
    .set({ passwordHash, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, row.userId));

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(schema.passwordResetTokens.id, row.id));

  return { ok: true as const };
}
