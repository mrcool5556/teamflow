import { open } from "node:fs/promises";
import { config } from "../config.js";

/* ---------- CORS allowlist ---------- */

const DEV_ORIGINS = Array.from({ length: 7 }, (_, i) => `http://localhost:${5173 + i}`).concat(
  Array.from({ length: 7 }, (_, i) => `http://127.0.0.1:${5173 + i}`),
);

function originOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Allowed browser origins: PUBLIC_URL plus CORS_ORIGINS (comma-separated). Outside production
 * the Vite dev ports on localhost are allowed too. Anything else gets no CORS headers, which
 * for a browser means same-origin only.
 */
export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const publicOrigin = originOf(config.publicUrl);
  if (publicOrigin) allowed.add(publicOrigin);
  for (const origin of config.corsOrigins) allowed.add(origin);
  if (!config.isProduction) {
    for (const origin of DEV_ORIGINS) allowed.add(origin);
  }
  return allowed;
}

export function resolveCorsOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) return null;
  return getAllowedOrigins().has(requestOrigin) ? requestOrigin : null;
}

/* ---------- In-memory rate limit ---------- */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Fixed-window counter per key (normally the client IP). Returns `null` when allowed, or the
 * number of seconds until the window resets when the limit is exceeded.
 */
export function checkRateLimit(key: string, now = Date.now()): number | null {
  const limit = config.authRateLimit;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + DEFAULT_WINDOW_MS });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  return null;
}

/** Test hook. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Pick the client address. X-Forwarded-For is only trusted when TEAMFLOW_TRUST_PROXY=1, since
 * otherwise any client could spoof it to dodge the limit.
 */
export function clientKey(
  headers: { get(name: string): string | null | undefined },
  remoteAddress: string | undefined,
) {
  if (config.trustProxy) {
    const forwarded = headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }
  return remoteAddress ?? "unknown";
}

/* ---------- Inline MIME sniffing ---------- */

/** Types that may be rendered inline. Everything else is served as a download. */
export const INLINE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "application/pdf",
]);

/**
 * Detect a small set of inline-safe types from the file's leading bytes. The stored MIME type
 * came from the uploader and is never trusted for inline rendering.
 */
export function sniffInlineMimeType(head: Buffer): string | null {
  if (head.length < 12) return null;
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (head.subarray(0, 4).toString("latin1") === "OggS") return "video/ogg";
  if (head.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = head.subarray(8, 12).toString("latin1");
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

export async function sniffFileInlineMimeType(fullPath: string): Promise<string | null> {
  const handle = await open(fullPath, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    return sniffInlineMimeType(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
