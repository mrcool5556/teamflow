import {
  SITE_ERROR_CODES,
  SITE_NAME_DEFAULT,
  type MailSecurity,
  type MailSettingsPublic,
  type SettingSource,
  type SignupSettingsPublic,
  type SiteSettingsPublic,
  type UpdateMailSettingsInput,
  type UpdateSignupSettingsInput,
  type UpdateSiteSettingsInput,
} from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { config, type SmtpConfig } from "../config.js";
import { db } from "../db.js";
import { ApiError } from "./errors.js";
import { decryptSecret, encryptSecret } from "./secretsCrypto.js";

/**
 * Site name, public address, outgoing email and sign-up policy. Each reads .env first (which
 * wins and is read-only on the admin page), then the value saved in instance_settings, then a
 * built-in default. Values are cached in memory and the cache is dropped on every save, so a
 * change takes effect at once without a restart.
 */

type SavedSite = { siteName?: string; publicUrl?: string };
type SavedMail = {
  host: string;
  port: number;
  security: MailSecurity;
  user: string | null;
  /** encryptSecret() blob, or null for no password. */
  passwordEnc: string | null;
  from: string | null;
};
type SavedSignup = { inviteOnly?: boolean };

const KEYS = { site: "site", mail: "mail", signup: "signup" } as const;

const cache = new Map<string, unknown>();

function readSaved<T>(key: string): T | null {
  if (cache.has(key)) return cache.get(key) as T | null;
  const row = db
    .select({ value: schema.instanceSettings.value })
    .from(schema.instanceSettings)
    .where(eq(schema.instanceSettings.key, key))
    .get();
  let value: T | null = null;
  if (row) {
    try {
      value = JSON.parse(row.value) as T;
    } catch {
      value = null;
    }
  }
  cache.set(key, value);
  return value;
}

function writeSaved(key: string, value: unknown) {
  const updatedAt = new Date().toISOString();
  if (value === null) {
    db.delete(schema.instanceSettings).where(eq(schema.instanceSettings.key, key)).run();
  } else {
    const json = JSON.stringify(value);
    db.insert(schema.instanceSettings)
      .values({ key, value: json, updatedAt })
      .onConflictDoUpdate({ target: schema.instanceSettings.key, set: { value: json, updatedAt } })
      .run();
  }
  cache.delete(key);
}

/** Test hook: forget cached values (after a test writes instance_settings directly). */
export function resetSiteSettingsCache() {
  cache.clear();
}

function setInEnv(name: string) {
  return new ApiError(
    409,
    `${name} is set in .env, which wins over this page. Change it there and restart.`,
    SITE_ERROR_CODES.setInEnv,
    { variable: name },
  );
}

/* ---------- site name and public address ---------- */

export function getSiteSettings(): SiteSettingsPublic {
  const saved = readSaved<SavedSite>(KEYS.site) ?? {};
  let siteName = SITE_NAME_DEFAULT;
  let siteNameSource: SettingSource = "default";
  if (config.envSet.siteName && config.siteName) {
    siteName = config.siteName;
    siteNameSource = "env";
  } else if (saved.siteName) {
    siteName = saved.siteName;
    siteNameSource = "saved";
  }

  let publicUrl = config.publicUrl;
  let publicUrlSource: SettingSource = "default";
  if (config.envSet.publicUrl) {
    publicUrlSource = "env";
  } else if (saved.publicUrl) {
    publicUrl = saved.publicUrl;
    publicUrlSource = "saved";
  }
  return { siteName, siteNameSource, publicUrl, publicUrlSource };
}

/** The address people open Teamflow at, no trailing slash. Links in emails and invites use it. */
export function getPublicUrl() {
  return getSiteSettings().publicUrl;
}

export function getSiteName() {
  return getSiteSettings().siteName;
}

export function updateSiteSettings(input: UpdateSiteSettingsInput): SiteSettingsPublic {
  if (input.siteName !== undefined && config.envSet.siteName) throw setInEnv("TEAMFLOW_SITE_NAME");
  if (input.publicUrl !== undefined && config.envSet.publicUrl) throw setInEnv("PUBLIC_URL");
  const saved = readSaved<SavedSite>(KEYS.site) ?? {};
  writeSaved(KEYS.site, {
    ...saved,
    ...(input.siteName !== undefined ? { siteName: input.siteName } : {}),
    ...(input.publicUrl !== undefined ? { publicUrl: input.publicUrl } : {}),
  });
  return getSiteSettings();
}

/* ---------- outgoing email ---------- */

function securityOf(smtp: SmtpConfig): MailSecurity {
  if (smtp.secure) return "ssl";
  if (smtp.ignoreTLS) return "none";
  return "starttls";
}

export function getMailSettings(): MailSettingsPublic {
  if (config.smtp) {
    return {
      configured: true,
      source: "env",
      host: config.smtp.host,
      port: config.smtp.port,
      security: securityOf(config.smtp),
      user: config.smtp.user ?? null,
      passwordSet: Boolean(config.smtp.pass),
      from: config.smtp.from,
    };
  }
  const saved = readSaved<SavedMail>(KEYS.mail);
  if (!saved) {
    return {
      configured: false,
      source: "default",
      host: null,
      port: 587,
      security: "starttls",
      user: null,
      passwordSet: false,
      from: null,
    };
  }
  return {
    configured: true,
    source: "saved",
    host: saved.host,
    port: saved.port,
    security: saved.security,
    user: saved.user,
    passwordSet: Boolean(saved.passwordEnc),
    from: saved.from,
  };
}

/** The SMTP settings in force (.env first), or null when email is not set up. */
export function getSmtpConfig(): SmtpConfig | null {
  if (config.smtp) return config.smtp;
  const saved = readSaved<SavedMail>(KEYS.mail);
  if (!saved) return null;
  let pass = "";
  if (saved.passwordEnc) {
    try {
      pass = decryptSecret(saved.passwordEnc);
    } catch {
      // The secrets key changed since it was saved; the admin has to enter it again.
      pass = "";
    }
  }
  return {
    host: saved.host,
    port: saved.port,
    secure: saved.security === "ssl",
    requireTLS: saved.security === "starttls",
    ignoreTLS: saved.security === "none",
    user: saved.user ?? undefined,
    pass,
    from: saved.from ?? defaultFromAddress(),
  };
}

function defaultFromAddress() {
  let host = "localhost";
  try {
    host = new URL(getPublicUrl()).hostname;
  } catch {
    // keep localhost
  }
  return `${getSiteName()} <teamflow@${host}>`;
}

export function updateMailSettings(input: UpdateMailSettingsInput): MailSettingsPublic {
  if (config.smtp) throw setInEnv("SMTP_HOST");
  const saved = readSaved<SavedMail>(KEYS.mail);
  let passwordEnc = saved?.passwordEnc ?? null;
  if (input.password !== undefined) {
    passwordEnc = input.password ? encryptSecret(input.password) : null;
  }
  writeSaved(KEYS.mail, {
    host: input.host,
    port: input.port,
    security: input.security,
    user: input.user?.trim() || null,
    passwordEnc,
    from: input.from?.trim() || null,
  } satisfies SavedMail);
  return getMailSettings();
}

export function clearMailSettings(): MailSettingsPublic {
  if (config.smtp) throw setInEnv("SMTP_HOST");
  writeSaved(KEYS.mail, null);
  return getMailSettings();
}

/* ---------- who can sign up ---------- */

export function getSignupSettings(): SignupSettingsPublic {
  if (config.envSet.inviteOnly) return { inviteOnly: config.inviteOnly, source: "env" };
  const saved = readSaved<SavedSignup>(KEYS.signup);
  if (saved && typeof saved.inviteOnly === "boolean") {
    return { inviteOnly: saved.inviteOnly, source: "saved" };
  }
  return { inviteOnly: config.inviteOnly, source: "default" };
}

export function isInviteOnly() {
  return getSignupSettings().inviteOnly;
}

export function updateSignupSettings(input: UpdateSignupSettingsInput): SignupSettingsPublic {
  if (config.envSet.inviteOnly) throw setInEnv("TEAMFLOW_INVITE_ONLY");
  writeSaved(KEYS.signup, { inviteOnly: input.inviteOnly } satisfies SavedSignup);
  return getSignupSettings();
}
