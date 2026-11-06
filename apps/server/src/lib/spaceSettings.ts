import type { SpaceSettingsPublic, UpdateSpaceSettingsInput } from "@teamflow/core";
import { schema, type DbExecutor } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { config } from "../config.js";

const SETTINGS_KEY = "spaces";

/**
 * Space settings in force: the env defaults (TEAMFLOW_FREE_SPACE_CAP_BYTES,
 * TEAMFLOW_FREE_SPACES_PER_USER, TEAMFLOW_MIN_FREE_DISK_BYTES) with any value an instance admin
 * saved on the admin page on top.
 */
export function getSpaceSettings(db: DbExecutor): SpaceSettingsPublic {
  const defaults = { ...config.spaces };
  const row = db
    .select({ value: schema.instanceSettings.value })
    .from(schema.instanceSettings)
    .where(eq(schema.instanceSettings.key, SETTINGS_KEY))
    .get();
  if (!row) return defaults;
  let saved: Partial<SpaceSettingsPublic> = {};
  try {
    saved = JSON.parse(row.value) as Partial<SpaceSettingsPublic>;
  } catch {
    return defaults;
  }
  const pick = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
  return {
    freeSpaceCapBytes: pick(saved.freeSpaceCapBytes, defaults.freeSpaceCapBytes),
    freeSpacesPerUser: pick(saved.freeSpacesPerUser, defaults.freeSpacesPerUser),
    minFreeDiskBytes: pick(saved.minFreeDiskBytes, defaults.minFreeDiskBytes),
  };
}

/** Save the given fields over the current settings; returns the settings now in force. */
export function updateSpaceSettings(
  db: DbExecutor,
  input: UpdateSpaceSettingsInput,
): SpaceSettingsPublic {
  const next = { ...getSpaceSettings(db) };
  if (input.freeSpaceCapBytes !== undefined) next.freeSpaceCapBytes = input.freeSpaceCapBytes;
  if (input.freeSpacesPerUser !== undefined) next.freeSpacesPerUser = input.freeSpacesPerUser;
  if (input.minFreeDiskBytes !== undefined) next.minFreeDiskBytes = input.minFreeDiskBytes;
  const value = JSON.stringify(next);
  const updatedAt = new Date().toISOString();
  db.insert(schema.instanceSettings)
    .values({ key: SETTINGS_KEY, value, updatedAt })
    .onConflictDoUpdate({ target: schema.instanceSettings.key, set: { value, updatedAt } })
    .run();
  return next;
}
