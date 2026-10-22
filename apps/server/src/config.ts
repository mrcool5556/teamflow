import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_ATTACHMENT_LIMITS } from "@teamflow/core";
import { findRepoRoot } from "@teamflow/db";

/* ---------- Secret validation (lane 2 refusal rules) ---------- */

/** Placeholder values shipped in .env templates. Never accepted as a real secret. */
export const PLACEHOLDER_SECRETS = [
  "change-me-in-production-use-long-random-string",
  "change-me-to-a-long-random-string",
  "dev-secret",
] as const;

const DEV_FALLBACK_SECRET = "dev-secret";
const MIN_SECRET_LENGTH = 16;

export function isPlaceholderSecret(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return (
    trimmed.length < MIN_SECRET_LENGTH ||
    (PLACEHOLDER_SECRETS as readonly string[]).includes(trimmed)
  );
}

export function devSecretsAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" || env.TEAMFLOW_ALLOW_DEV_SECRET === "1";
}

/**
 * Resolve a secret from the environment, refusing placeholders and unset values unless the
 * process explicitly opts into development mode. Throws so the server refuses to start.
 */
export function resolveSecret(
  name: string,
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isPlaceholderSecret(value)) return value!.trim();
  if (devSecretsAllowed(env)) {
    console.warn(
      `[teamflow] ${name} is unset or a placeholder; using an insecure development value. ` +
        "Never run like this in production.",
    );
    return DEV_FALLBACK_SECRET;
  }
  throw new Error(
    `${name} is unset or still a placeholder. Set a long random value (e.g. openssl rand -hex 32), ` +
      "or set NODE_ENV=development / TEAMFLOW_ALLOW_DEV_SECRET=1 for local development only.",
  );
}

/* ---------- Env schema ---------- */

const TRUE_WORDS = new Set(["true", "1", "yes", "on"]);
const FALSE_WORDS = new Set(["false", "0", "no", "off"]);

/** "true"/"1"/"yes"/"on" and "false"/"0"/"no"/"off"; unset or empty means `fallback`. */
function boolVar(fallback: boolean) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const value = raw?.trim().toLowerCase();
      if (!value) return fallback;
      if (TRUE_WORDS.has(value)) return true;
      if (FALSE_WORDS.has(value)) return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected true or false, got "${raw}"`,
      });
      return z.NEVER;
    });
}

/** Positive integer; unset or empty means `fallback`. */
function intVar(fallback: number, options: { min?: number } = {}) {
  const min = options.min ?? 1;
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const value = raw?.trim();
      if (!value) return fallback;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `expected an integer >= ${min}, got "${raw}"`,
        });
        return z.NEVER;
      }
      return parsed;
    });
}

/** Trimmed string; unset or empty becomes undefined. */
const optionalString = z
  .string()
  .optional()
  .transform((raw) => {
    const value = raw?.trim();
    return value ? value : undefined;
  });

const urlString = optionalString.refine(
  (value) => {
    if (value === undefined) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "expected an absolute URL" },
);

const envSchema = z.object({
  NODE_ENV: optionalString,
  TEAMFLOW_ALLOW_DEV_SECRET: boolVar(false),
  PORT: intVar(3000, { min: 0 }),
  HOST: optionalString,
  DATABASE_URL: optionalString,
  JWT_SECRET: z.string().optional(),
  TEAMFLOW_SECRETS_KEY: z.string().optional(),
  TEAMFLOW_BOT_CONFIG_KEY: optionalString,
  PUBLIC_URL: urlString,
  CORS_ORIGINS: optionalString,
  TEAMFLOW_AUTH_RATE_LIMIT: intVar(10),
  TEAMFLOW_TRUST_PROXY: boolVar(false),
  TEAMFLOW_INSTANCE_ADMINS: optionalString,
  TEAMFLOW_INVITE_ONLY: boolVar(false),
  SMTP_HOST: optionalString,
  SMTP_PORT: intVar(587),
  SMTP_SECURE: boolVar(false),
  SMTP_USER: optionalString,
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: optionalString,
  ATTACHMENT_MAX_IMAGE_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.imageBytes),
  ATTACHMENT_MAX_VIDEO_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.videoBytes),
  ATTACHMENT_MAX_ZIP_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.zipBytes),
  ATTACHMENT_MAX_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.defaultBytes),
  UPLOAD_CHUNK_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.chunkBytes),
  UPLOAD_CHUNK_THRESHOLD_BYTES: intVar(DEFAULT_ATTACHMENT_LIMITS.chunkThresholdBytes),
  UPLOAD_DIR: optionalString,
  TEAMFLOW_BUNDLE_MAX_ENTRIES: intVar(5000),
  TEAMFLOW_BUNDLE_MAX_BYTES: intVar(2 * 1024 * 1024 * 1024),
  TEAMFLOW_MAINTENANCE_ENABLED: boolVar(false),
  TEAMFLOW_MAINTENANCE_SUDO: boolVar(true),
  TEAMFLOW_APP_DIR: optionalString,
  TEAMFLOW_BACKUP_DIR: optionalString,
  TEAMFLOW_BACKUP_SCRIPT: optionalString,
  TEAMFLOW_UPDATE_SCRIPT: optionalString,
  TEAMFLOW_DISCORD_BOT_SCRIPT: optionalString,
  TEAMFLOW_DB_MAINTENANCE_NIGHTLY: boolVar(false),
  WEB_DIST: optionalString,
  SERVE_WEB: boolVar(false),
});

/* ---------- Config object ---------- */

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string;
  from: string;
};

export type AppConfig = {
  nodeEnv: string | undefined;
  isDevelopment: boolean;
  isProduction: boolean;
  port: number;
  host: string;
  /** Passed to createDb; undefined means the db package default (data/teamflow.db). */
  databaseUrl: string | undefined;
  /** Validated JWT secret (or the development fallback when explicitly allowed). */
  jwtSecret: string;
  /** TEAMFLOW_SECRETS_KEY when set; null means fall back to jwtSecret. */
  secretsKey: string | null;
  /** Shared key for GET /integrations/discord/bot-config; null disables the endpoint. */
  botConfigKey: string | null;
  /** No trailing slash. */
  publicUrl: string;
  /** Extra browser origins (CORS_ORIGINS), normalised to origins. */
  corsOrigins: string[];
  /** Credential endpoint attempts per minute per client. */
  authRateLimit: number;
  trustProxy: boolean;
  /** Lower-cased emails from TEAMFLOW_INSTANCE_ADMINS. */
  instanceAdminEmails: string[];
  inviteOnly: boolean;
  smtp: SmtpConfig | null;
  attachments: {
    imageBytes: number;
    videoBytes: number;
    zipBytes: number;
    defaultBytes: number;
    chunkBytes: number;
    chunkThresholdBytes: number;
  };
  /** Absolute path. */
  uploadDir: string;
  bundle: { maxEntries: number; maxBytes: number };
  /** Absolute path of the checkout the maintenance scripts operate on. */
  appDir: string;
  maintenance: {
    enabled: boolean;
    sudo: boolean;
    backupDir: string;
    backupScript: string | undefined;
    updateScript: string | undefined;
    discordBotScript: string | undefined;
  };
  /** Run the data-maintenance pass (trash purge etc.) nightly in-process. */
  dbMaintenanceNightly: boolean;
  /** Absolute path of the built web app. */
  webDist: string;
  serveWeb: boolean;
};

function originOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveFrom(base: string, value: string | undefined) {
  if (!value) return undefined;
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function formatIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
}

/** Parse and validate `env`. Throws with every problem listed so the server refuses to start. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatIssues(parsed.error)}`);
  }
  const e = parsed.data;

  const repoRoot = findRepoRoot();
  const appDir = resolveFrom(repoRoot, e.TEAMFLOW_APP_DIR) ?? repoRoot;
  const publicUrl = (e.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const corsOrigins: string[] = [];
  for (const raw of (e.CORS_ORIGINS ?? "").split(",")) {
    const origin = originOf(raw.trim());
    if (origin && !corsOrigins.includes(origin)) corsOrigins.push(origin);
  }

  const smtp: SmtpConfig | null = e.SMTP_HOST
    ? {
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE || e.SMTP_PORT === 465,
        user: e.SMTP_USER,
        pass: e.SMTP_PASS ?? "",
        from: e.SMTP_FROM ?? "teamflow@localhost",
      }
    : null;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = e.WEB_DIST ?? path.resolve(here, "..", "..", "web", "dist");

  return {
    nodeEnv: e.NODE_ENV,
    isDevelopment: e.NODE_ENV === "development",
    isProduction: e.NODE_ENV === "production",
    port: e.PORT,
    host: e.HOST ?? "0.0.0.0",
    databaseUrl: e.DATABASE_URL,
    jwtSecret: resolveSecret("JWT_SECRET", e.JWT_SECRET, env),
    secretsKey: e.TEAMFLOW_SECRETS_KEY?.trim()
      ? resolveSecret("TEAMFLOW_SECRETS_KEY", e.TEAMFLOW_SECRETS_KEY, env)
      : null,
    botConfigKey: e.TEAMFLOW_BOT_CONFIG_KEY ?? null,
    publicUrl,
    corsOrigins,
    authRateLimit: e.TEAMFLOW_AUTH_RATE_LIMIT,
    trustProxy: e.TEAMFLOW_TRUST_PROXY,
    instanceAdminEmails: (e.TEAMFLOW_INSTANCE_ADMINS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    inviteOnly: e.TEAMFLOW_INVITE_ONLY,
    smtp,
    attachments: {
      imageBytes: e.ATTACHMENT_MAX_IMAGE_BYTES,
      videoBytes: e.ATTACHMENT_MAX_VIDEO_BYTES,
      zipBytes: e.ATTACHMENT_MAX_ZIP_BYTES,
      defaultBytes: e.ATTACHMENT_MAX_BYTES,
      chunkBytes: e.UPLOAD_CHUNK_BYTES,
      chunkThresholdBytes: e.UPLOAD_CHUNK_THRESHOLD_BYTES,
    },
    uploadDir: resolveFrom(repoRoot, e.UPLOAD_DIR) ?? path.join(repoRoot, "data", "uploads"),
    bundle: { maxEntries: e.TEAMFLOW_BUNDLE_MAX_ENTRIES, maxBytes: e.TEAMFLOW_BUNDLE_MAX_BYTES },
    appDir,
    maintenance: {
      enabled: e.TEAMFLOW_MAINTENANCE_ENABLED,
      sudo: e.TEAMFLOW_MAINTENANCE_SUDO,
      backupDir: resolveFrom(appDir, e.TEAMFLOW_BACKUP_DIR) ?? "/var/backups/teamflow",
      backupScript: resolveFrom(appDir, e.TEAMFLOW_BACKUP_SCRIPT),
      updateScript: resolveFrom(appDir, e.TEAMFLOW_UPDATE_SCRIPT),
      discordBotScript: resolveFrom(appDir, e.TEAMFLOW_DISCORD_BOT_SCRIPT),
    },
    dbMaintenanceNightly: e.TEAMFLOW_DB_MAINTENANCE_NIGHTLY,
    webDist,
    serveWeb: e.SERVE_WEB,
  };
}

/**
 * The process configuration, read and validated once when this module first loads (i.e. at
 * boot). Import this everywhere instead of reading process.env.
 */
export const config: AppConfig = loadConfig();

/**
 * Re-read process.env into the shared `config` object in place. Test hook: lets a test change an
 * environment variable after boot and have every module observe the new value.
 */
export function reloadConfig(env: NodeJS.ProcessEnv = process.env) {
  Object.assign(config, loadConfig(env));
  return config;
}
