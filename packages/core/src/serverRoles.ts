import { z } from "zod";

/**
 * Who runs the server. One **Server Owner** (the account made on /setup; ownership moves only by
 * the Owner's own "Transfer ownership") holds every power. **Trusted admins** hold the powers the
 * Owner ticks for them; with none ticked they have no Server admin access. Separate from the
 * roles inside each Flow. docs/AUTH.md "Server Owner and trusted admins".
 */

export const SERVER_POWERS = [
  "updates",
  "backups",
  "people",
  "flows",
  "site",
  "discord",
  "signup",
] as const;
export type ServerPower = (typeof SERVER_POWERS)[number];

export const SERVER_POWER_LABELS: Record<ServerPower, string> = {
  updates: "Updates",
  backups: "Backups",
  people: "People",
  flows: "Flows",
  site: "Site & email",
  discord: "Discord bot",
  signup: "Sign-up rules",
};

export const SERVER_POWER_HINTS: Record<ServerPower, string> = {
  updates: "Install updates and choose the release channel",
  backups: "Back up, restore, delete backups and set how many to keep",
  people: "See every account and send password reset links",
  flows: "Make Flows, set upload caps and Flow defaults, empty a Flow's trash",
  site: "Site name, public address and email",
  discord: "Discord bot credentials and service",
  signup: "Who can make an account",
};

export type ServerRole = "owner" | "admin";

export function isServerPower(value: unknown): value is ServerPower {
  return typeof value === "string" && (SERVER_POWERS as readonly string[]).includes(value);
}

/** Server powers in canonical order, without duplicates or unknown values. */
export function normaliseServerPowers(values: readonly unknown[]): ServerPower[] {
  return SERVER_POWERS.filter((power) => values.includes(power));
}

export type ServerAdminPublic = {
  id: string;
  name: string;
  email: string;
  role: ServerRole;
  /** Every power for the Owner and for admins listed in TEAMFLOW_INSTANCE_ADMINS. */
  powers: ServerPower[];
  /** Listed in TEAMFLOW_INSTANCE_ADMINS: all powers, cannot be changed or removed in the app. */
  fromEnv: boolean;
};

export const setServerAdminSchema = z
  .object({ powers: z.array(z.enum(SERVER_POWERS)).max(SERVER_POWERS.length) })
  .strict();
export type SetServerAdminInput = z.infer<typeof setServerAdminSchema>;

export const transferOwnershipSchema = z
  .object({
    userId: z.string().uuid(),
    /** The new Owner's email, typed to confirm. */
    confirmEmail: z.string().trim().min(1).max(320),
  })
  .strict();
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
