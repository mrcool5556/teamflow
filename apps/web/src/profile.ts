import {
  clampBoardColumnWidth,
  clampCardMinHeight,
  createDefaultUserProfile,
  type ColorPreset,
  type ThemeMode,
  type UserProfile,
} from "@teamflow/core";

const LEGACY_COLUMN_WIDTH_KEY = "teamflow_board_column_width";

export function readLegacyLocalProfile(): Partial<UserProfile["board"]> | null {
  const raw = localStorage.getItem(LEGACY_COLUMN_WIDTH_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return { columnWidth: clampBoardColumnWidth(parsed) };
}

export function clearLegacyLocalProfile() {
  localStorage.removeItem(LEGACY_COLUMN_WIDTH_KEY);
}

export function applyUserProfile(profile: UserProfile) {
  const root = document.documentElement;
  root.dataset.theme = profile.appearance.theme;
  root.dataset.colorPreset = profile.appearance.colorPreset;
  root.style.setProperty(
    "--board-column-width",
    `${clampBoardColumnWidth(profile.board.columnWidth)}px`,
  );
  root.style.setProperty(
    "--card-min-height",
    `${clampCardMinHeight(profile.board.cardMinHeight)}px`,
  );
}

export function mergeWithLegacyDefaults(profile: UserProfile): {
  profile: UserProfile;
  migrated: boolean;
} {
  const legacy = readLegacyLocalProfile();
  if (!legacy?.columnWidth) {
    return { profile, migrated: false };
  }

  const defaults = createDefaultUserProfile();
  if (profile.board.columnWidth !== defaults.board.columnWidth) {
    return { profile, migrated: false };
  }

  return {
    profile: {
      ...profile,
      board: {
        ...profile.board,
        columnWidth: legacy.columnWidth,
      },
    },
    migrated: true,
  };
}

export type { ThemeMode, ColorPreset, UserProfile };
