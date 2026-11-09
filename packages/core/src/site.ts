import { z } from "zod";

/**
 * Server-wide settings an instance admin can change on the admin page (and during first-time
 * setup): site name, public address, outgoing email and who may sign up. A value set in .env
 * always wins and shows as read-only.
 */

export const SITE_NAME_DEFAULT = "Teamflow";
export const SITE_NAME_MAX = 80;

/** Where a setting's value comes from: .env (read-only), saved on the admin page, or built in. */
export const SETTING_SOURCES = ["env", "saved", "default"] as const;
export type SettingSource = (typeof SETTING_SOURCES)[number];

export type SiteSettingsPublic = {
  siteName: string;
  siteNameSource: SettingSource;
  /** No trailing slash. */
  publicUrl: string;
  publicUrlSource: SettingSource;
};

/** Normalise an http(s) address: origin plus path, no trailing slash, no query or hash. */
export function normalisePublicUrl(raw: string): string | null {
  // No URL global here (core has no DOM or Node lib), so a strict pattern instead.
  const match =
    /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d{1,5})?(\/[^\s?#]*)?(?:[?#]\S*)?$/i.exec(
      raw.trim(),
    );
  if (!match) return null;
  const [, scheme, host, port = "", path = ""] = match;
  if (port && Number(port.slice(1)) > 65535) return null;
  const defaultPort = scheme!.toLowerCase() === "https" ? ":443" : ":80";
  const keptPort = port === defaultPort ? "" : port;
  return `${scheme!.toLowerCase()}://${host!.toLowerCase()}${keptPort}${path}`.replace(/\/+$/, "");
}

const publicUrlField = z
  .string()
  .max(500)
  .transform((raw, ctx) => {
    const value = normalisePublicUrl(raw);
    if (!value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a full address starting with http:// or https://",
      });
      return z.NEVER;
    }
    return value;
  });

export const updateSiteSettingsSchema = z
  .object({
    siteName: z.string().trim().min(1).max(SITE_NAME_MAX).optional(),
    publicUrl: publicUrlField.optional(),
  })
  .strict();
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

/** starttls: plain connect then upgrade (587). ssl: TLS from the start (465). none: no TLS. */
export const MAIL_SECURITY = ["starttls", "ssl", "none"] as const;
export type MailSecurity = (typeof MAIL_SECURITY)[number];

export type MailSettingsPublic = {
  configured: boolean;
  /** "default" means not set up anywhere. */
  source: SettingSource;
  host: string | null;
  port: number;
  security: MailSecurity;
  user: string | null;
  /** The password itself is never sent back. */
  passwordSet: boolean;
  from: string | null;
};

const hostField = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9.\-[\]:]+$/, "Enter a host name such as smtp.example.com");

export const updateMailSettingsSchema = z
  .object({
    host: hostField,
    port: z.number().int().min(1).max(65535),
    security: z.enum(MAIL_SECURITY),
    user: z.string().trim().max(255).nullable().optional(),
    /** Omit to keep the saved password; null or "" clears it. */
    password: z.string().max(1000).nullable().optional(),
    from: z.string().trim().max(320).nullable().optional(),
  })
  .strict();
export type UpdateMailSettingsInput = z.infer<typeof updateMailSettingsSchema>;

export const sendTestMailSchema = z
  .object({ to: z.string().trim().email().max(320).optional() })
  .strict();
export type SendTestMailInput = z.infer<typeof sendTestMailSchema>;

export type SignupSettingsPublic = {
  /** True: only people with an invite link can register. */
  inviteOnly: boolean;
  source: SettingSource;
};

export const updateSignupSettingsSchema = z.object({ inviteOnly: z.boolean() }).strict();
export type UpdateSignupSettingsInput = z.infer<typeof updateSignupSettingsSchema>;

export const SITE_ERROR_CODES = {
  /** The value is set in .env, which wins; change it there. */
  setInEnv: "setting_set_in_env",
} as const;

/* ---------- first-time setup ---------- */

/**
 * A fresh server (no accounts) is claimed with a one-time setup code. The installer prints it;
 * it is also in the server log and in `<data dir>/setup-code`. Contract: docs/SETUP.md.
 */
export const SETUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SETUP_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

/** Upper-case and drop spaces and dashes, then re-insert the dash: "k7qm 2pxd" → "K7QM-2PXD". */
export function normaliseSetupCode(raw: string) {
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export type SetupStatusPublic = {
  /** True only while the server has no accounts at all. */
  needed: boolean;
  /** Always true while needed: the admin account needs the setup code. */
  codeRequired: boolean;
};

export const setupAdminSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;

export const SETUP_ERROR_CODES = {
  /** No account exists yet; the first one is made on /setup with the setup code. */
  required: "setup_required",
  /** Setup already happened; the setup page is closed for good. */
  done: "setup_done",
  /** Wrong or missing setup code. */
  badCode: "setup_code_invalid",
} as const;

/* ---------- setup checklist (setup step 5 and the admin Overview card) ---------- */

export const SETUP_CHECKLIST_IDS = [
  "admin",
  "site",
  "email",
  "storage",
  "backup",
  "service",
  "flow",
] as const;
export type SetupChecklistId = (typeof SETUP_CHECKLIST_IDS)[number];

/** done; todo; skipped (chosen to leave for later); unavailable (cannot be done on this host). */
export type SetupChecklistState = "done" | "todo" | "skipped" | "unavailable";

export type SetupChecklistItem = {
  id: SetupChecklistId;
  state: SetupChecklistState;
  title: string;
  detail: string;
};

export type SetupChecklistPublic = {
  items: SetupChecklistItem[];
  doneCount: number;
  /** Items that count (unavailable ones don't). */
  total: number;
  /** Every counted item is done or skipped. */
  complete: boolean;
  /** The admin hid the Overview card. */
  dismissed: boolean;
};

export const updateSetupProgressSchema = z
  .object({
    emailSkipped: z.boolean().optional(),
    storageReviewed: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .strict();
export type UpdateSetupProgressInput = z.infer<typeof updateSetupProgressSchema>;

export type SiteSettingsAdminPublic = SiteSettingsPublic & {
  /** The address this request came in on (honours X-Forwarded-* when the proxy is trusted). */
  suggestedPublicUrl: string | null;
};
