import {

  clampBoardColumnWidth,

  clampCardMinHeight,

  createDefaultUserProfile,

  PRIORITY_COLOR_DEFAULTS,

  resolveUiColors,

  type ColorPreset,

  type ThemeMode,

  type UserProfile,

} from "@teamflow/core";



const LEGACY_COLUMN_WIDTH_KEY = "teamflow_board_column_width";



const UI_COLOR_VARS = ["--primary", "--accent", "--accent-text", "--text", "--text-soft"] as const;



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



function clearUiColorOverrides(root: HTMLElement) {

  for (const variable of UI_COLOR_VARS) {

    root.style.removeProperty(variable);

  }

}



function applyUiColorOverrides(profile: UserProfile, root: HTMLElement) {

  clearUiColorOverrides(root);



  const { appearance } = profile;

  const { primary, accent } = resolveUiColors(appearance);



  root.style.setProperty("--primary", primary);

  root.style.setProperty("--accent", accent);

  root.style.setProperty("--accent-text", accent);



  if (appearance.colorPreset !== "custom") return;



  const { customColors } = appearance;

  if (customColors.text) root.style.setProperty("--text", customColors.text);

  if (customColors.textSoft) root.style.setProperty("--text-soft", customColors.textSoft);

}



export function applyUserProfile(profile: UserProfile) {

  const root = document.documentElement;

  const { appearance } = profile;



  root.dataset.theme = appearance.theme;

  root.dataset.colorPreset = appearance.colorPreset;

  root.dataset.shape = appearance.shape;

  root.dataset.chromeStyle = appearance.chromeStyle;

  root.dataset.semanticContrast = appearance.semanticContrast;

  root.dataset.textContrast = appearance.textContrast;



  applyUiColorOverrides(profile, root);

  for (const [level, color] of Object.entries(PRIORITY_COLOR_DEFAULTS)) {
    root.style.setProperty(`--priority-${level}`, color);
  }

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


