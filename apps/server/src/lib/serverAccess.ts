import {
  SERVER_POWERS,
  normaliseServerPowers,
  type ServerAdminPublic,
  type ServerPower,
  type ServerRole,
  type TransferOwnershipInput,
} from "@teamflow/core";
import { schema, type Db, type DbExecutor } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { ApiError, badRequest, forbidden, notFound } from "./errors.js";

/**
 * Server Owner and trusted admins (packages/core/src/serverRoles.ts). Stored on users:
 * is_server_owner (one account), is_instance_admin (on the admin list) and server_powers (JSON).
 * Accounts in TEAMFLOW_INSTANCE_ADMINS are trusted admins with every power, whatever is stored.
 */

export type ServerAccess = {
  role: ServerRole | null;
  powers: ServerPower[];
  fromEnv: boolean;
};

type UserRow = typeof schema.users.$inferSelect;

const NO_ACCESS: ServerAccess = { role: null, powers: [], fromEnv: false };

function parsePowers(raw: string | null): ServerPower[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? normaliseServerPowers(value) : [];
  } catch {
    return [];
  }
}

function listedInEnv(email: string) {
  return config.instanceAdminEmails.includes(email.toLowerCase());
}

/** What a user row may do on the server, without another query. */
export function serverAccessOfRow(
  row: Pick<UserRow, "email" | "isInstanceAdmin" | "isServerOwner" | "serverPowers">,
): ServerAccess {
  if (row.isServerOwner === 1) return { role: "owner", powers: [...SERVER_POWERS], fromEnv: false };
  const fromEnv = listedInEnv(row.email);
  if (fromEnv) return { role: "admin", powers: [...SERVER_POWERS], fromEnv: true };
  if (row.isInstanceAdmin !== 1) return NO_ACCESS;
  return { role: "admin", powers: parsePowers(row.serverPowers), fromEnv: false };
}

export function getServerAccess(db: DbExecutor, userId: string): ServerAccess {
  const row = db
    .select({
      email: schema.users.email,
      isInstanceAdmin: schema.users.isInstanceAdmin,
      isServerOwner: schema.users.isServerOwner,
      serverPowers: schema.users.serverPowers,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return row ? serverAccessOfRow(row) : NO_ACCESS;
}

/** True when the access includes any of `powers` (the Owner has them all). */
export function hasServerPower(access: ServerAccess, ...powers: ServerPower[]) {
  return powers.some((power) => access.powers.includes(power));
}

/** Server admin access at all: the Owner, or a trusted admin with at least one power. */
export function hasServerAdminAccess(access: ServerAccess) {
  return access.role !== null && access.powers.length > 0;
}

/* ---------- the admin list (Owner only, enforced by the routes) ---------- */

export function listServerAdmins(db: Db): ServerAdminPublic[] {
  const rows = db
    .select()
    .from(schema.users)
    .all()
    .filter(
      (row) => row.isServerOwner === 1 || row.isInstanceAdmin === 1 || listedInEnv(row.email),
    );
  return rows
    .map((row) => {
      const access = serverAccessOfRow(row);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: access.role ?? "admin",
        powers: access.powers,
        fromEnv: access.fromEnv,
      } satisfies ServerAdminPublic;
    })
    .sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1,
    );
}

function loadUser(db: Db, userId: string) {
  const row = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!row) throw notFound("User not found");
  return row;
}

function refuseOwnerOrEnv(row: UserRow) {
  if (row.isServerOwner === 1) {
    throw badRequest("The Server Owner has every power. Transfer ownership to change that.");
  }
  if (listedInEnv(row.email)) {
    throw new ApiError(
      409,
      `${row.email} is listed in TEAMFLOW_INSTANCE_ADMINS in .env, which gives every power at each login. Change it there.`,
      "setting_set_in_env",
      { variable: "TEAMFLOW_INSTANCE_ADMINS" },
    );
  }
}

/** Add someone to the trusted list, or change their powers. An empty list keeps them listed. */
export function setServerAdmin(db: Db, userId: string, powers: ServerPower[]): ServerAdminPublic {
  const row = loadUser(db, userId);
  refuseOwnerOrEnv(row);
  db.update(schema.users)
    .set({ isInstanceAdmin: 1, serverPowers: JSON.stringify(normaliseServerPowers(powers)) })
    .where(eq(schema.users.id, userId))
    .run();
  return listServerAdmins(db).find((admin) => admin.id === userId)!;
}

export function removeServerAdmin(db: Db, userId: string) {
  const row = loadUser(db, userId);
  refuseOwnerOrEnv(row);
  db.update(schema.users)
    .set({ isInstanceAdmin: 0, serverPowers: null })
    .where(eq(schema.users.id, userId))
    .run();
}

/**
 * The Owner hands ownership to another account (typed email confirms it). The old Owner stays a
 * trusted admin with every power. Both changes land together.
 */
export function transferServerOwnership(db: Db, actorId: string, input: TransferOwnershipInput) {
  const actor = loadUser(db, actorId);
  if (actor.isServerOwner !== 1) throw forbidden("Only the Server Owner can transfer ownership");
  if (input.userId === actorId) throw badRequest("You are already the Server Owner");
  const target = loadUser(db, input.userId);
  if (target.email.toLowerCase() !== input.confirmEmail.trim().toLowerCase()) {
    throw badRequest(`Type ${target.email} to confirm.`);
  }
  db.transaction((tx) => {
    tx.update(schema.users)
      .set({ isServerOwner: 0, isInstanceAdmin: 1, serverPowers: JSON.stringify(SERVER_POWERS) })
      .where(eq(schema.users.id, actorId))
      .run();
    tx.update(schema.users)
      .set({ isServerOwner: 1, isInstanceAdmin: 1, serverPowers: null })
      .where(eq(schema.users.id, target.id))
      .run();
  });
  return listServerAdmins(db);
}
