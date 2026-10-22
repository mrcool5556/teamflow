import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { getAttachmentLimits } from "../lib/attachments.js";
import { checkRateLimit, clientKey, resolveCorsOrigin } from "../lib/httpHardening.js";
import { getBundleImportLimits } from "../lib/teamBundle.js";

/** Allowlist: PUBLIC_URL + CORS_ORIGINS (+ localhost Vite ports outside production). */
export const corsAllowlist = cors({
  origin: (origin) => resolveCorsOrigin(origin),
  credentials: true,
});

export const noSniff = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

export const JSON_BODY_LIMIT = 1024 * 1024;

function uploadBodyLimit() {
  const limits = getAttachmentLimits();
  const largest = Math.max(
    limits.imageBytes,
    limits.videoBytes,
    limits.zipBytes,
    limits.defaultBytes,
    getBundleImportLimits().maxBytes,
  );
  return largest + JSON_BODY_LIMIT; // multipart framing overhead
}

/**
 * Body size caps, enforced before any handler buffers the body: 1 MB for JSON, the configured
 * attachment/bundle maximum for multipart uploads, one chunk for chunked upload PUTs.
 */
export const bodyLimits = createMiddleware(async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const contentType = c.req.header("content-type") ?? "";
  let maxSize = JSON_BODY_LIMIT;
  if (contentType.startsWith("multipart/form-data")) {
    maxSize = uploadBodyLimit();
  } else if (method === "PUT" && c.req.path.startsWith("/uploads/")) {
    maxSize = getAttachmentLimits().chunkBytes + 1024;
  }
  return bodyLimit({
    maxSize,
    onError: (ctx) => ctx.json({ error: "Request body too large", code: "payload_too_large" }, 413),
  })(c, next);
});

function remoteAddress(c: Context) {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/** Per-client rate limit on credential endpoints (TEAMFLOW_AUTH_RATE_LIMIT per minute). */
export async function authRateLimit(c: Context, next: Next) {
  if (c.req.method !== "POST") return next();
  const key = `${c.req.path}:${clientKey(c.req.raw.headers, remoteAddress(c))}`;
  const retryAfter = checkRateLimit(key);
  if (retryAfter !== null) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many attempts. Try again later.", code: "rate_limited" }, 429);
  }
  return next();
}
