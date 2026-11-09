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
  const match = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d{1,5})?(\/[^\s?#]*)?(?:[?#]\S*)?$/i.exec(
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
