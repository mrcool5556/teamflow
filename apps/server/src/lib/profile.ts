import { eq } from "drizzle-orm";
import {
  createDefaultUserProfile,
  parseUserProfile,
  type UserProfile,
  type UserProfileExport,
  type UserProfilePatch,
  USER_PROFILE_VERSION,
  userProfileSchema,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";

export async function getUserProfile(db: Db, userId: string): Promise<UserProfile> {
  const [row] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);

  if (!row) return createDefaultUserProfile();
  try {
    return parseUserProfile(JSON.parse(row.profile));
  } catch {
    return createDefaultUserProfile();
  }
}

export async function saveUserProfile(db: Db, userId: string, profile: UserProfile) {
  const normalized = userProfileSchema.parse(profile);
  const now = new Date().toISOString();
  const payload = JSON.stringify(normalized);

  const [existing] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(schema.userProfiles)
      .set({ profile: payload, updatedAt: now })
      .where(eq(schema.userProfiles.userId, userId));
  } else {
    await db.insert(schema.userProfiles).values({
      userId,
      profile: payload,
      updatedAt: now,
    });
  }

  return normalized;
}

export async function patchUserProfile(
  db: Db,
  userId: string,
  patch: UserProfilePatch,
): Promise<UserProfile> {
  const current = await getUserProfile(db, userId);
  const next = userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance: { ...current.appearance, ...patch.appearance },
    board: {
      ...current.board,
      ...patch.board,
      rowHeadersVisible: {
        ...current.board.rowHeadersVisible,
        ...patch.board?.rowHeadersVisible,
      },
    },
  });
  return saveUserProfile(db, userId, next);
}

export function buildProfileExport(
  profile: UserProfile,
  user?: { name: string; email: string },
): UserProfileExport {
  return {
    version: USER_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: user,
    profile: userProfileSchema.parse(profile),
  };
}
