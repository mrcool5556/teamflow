import {
  USER_PROFILE_VERSION,
  mergeUserProfile,
  parseUserProfileImport,
  type UserProfile,
  type UserProfileExport,
} from "@teamflow/core";

/**
 * A shareable look: the profile export format (so older imports and the server's import route
 * still read it) with nothing team-specific in it: no last team, no per-row header choices.
 */
export function buildLookExport(
  profile: UserProfile,
  exportedBy?: { name: string; email: string },
): UserProfileExport {
  return {
    version: USER_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    profile: {
      ...profile,
      board: { ...profile.board, rowHeadersVisible: {} },
      ui: {},
    },
  };
}

/** Parse pasted or uploaded text into a profile; throws a readable error if it is not one. */
export function parseLookText(text: string): UserProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That is not a Teamflow look (not valid JSON).");
  }
  if (!raw || typeof raw !== "object" || !("appearance" in raw || "profile" in raw)) {
    throw new Error("That is not a Teamflow look (no appearance in it).");
  }
  return parseUserProfileImport(raw);
}

/** The current profile with someone else's look and board size; your own team bits stay. */
export function withImportedLook(current: UserProfile, imported: UserProfile): UserProfile {
  return mergeUserProfile(
    { ...current, appearance: { ...current.appearance, customColors: {} } },
    {
      appearance: imported.appearance,
      board: {
        columnWidth: imported.board.columnWidth,
        columnWidthMode: imported.board.columnWidthMode,
        cardMinHeight: imported.board.cardMinHeight,
      },
    },
  );
}
