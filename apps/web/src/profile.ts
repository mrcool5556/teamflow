import {
  boardColumnWidthMode,
  clampBoardColumnWidth,
  clampCardMinHeight,
  createDefaultUserProfile,
  PRIORITY_COLOR_DEFAULTS,
  resolveUiColors,
  type ColorPreset,
  type ResolvedTheme,
  type ThemeMode,
  type UserProfile,
} from "@teamflow/core";

/**
 * Four columns per row width (`cqw` of `.board-row-scroll`, 0.65rem gaps), never narrower than
 * 300px or wider than the 420px default; past that the row scrolls sideways.
 */
const AUTO_BOARD_COLUMN_WIDTH = "clamp(300px, calc((100cqw - 3 * 0.65rem) / 4), 420px)";

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

  // Custom text colours (customColors.text / textSoft) are no longer applied: one value could
  // not suit both themes, and Text contrast covers the need. Old profiles keep the fields;
  // clearUiColorOverrides above removes anything a previous version set.
}

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

/** The theme to paint: "system" becomes dark or light from the OS (dark if it cannot tell). */
export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

let systemThemeProfile: UserProfile | null = null;
let systemThemeListening = false;

/** While the theme is "system", repaint when the OS switches between light and dark. */
function followSystemTheme(profile: UserProfile) {
  systemThemeProfile = profile.appearance.theme === "system" ? profile : null;
  if (systemThemeListening || !systemThemeProfile || typeof window.matchMedia !== "function") {
    return;
  }
  systemThemeListening = true;
  window.matchMedia(SYSTEM_DARK_QUERY).addEventListener("change", () => {
    if (systemThemeProfile) applyUserProfile(systemThemeProfile);
  });
}

/**
 * Design-your-own aspects become data-* attributes on <html>; "auto" removes the attribute so
 * the UI style's own look shows. styles/aspects.css reads them.
 */
function applyDesignAspects(appearance: UserProfile["appearance"], root: HTMLElement) {
  const set = (key: string, value: string | null) => {
    if (value === null) delete root.dataset[key];
    else root.dataset[key] = value;
  };
  const auto = (value: string) => (value === "auto" ? null : value);
  set("palette", appearance.colorTheme === "teamflow" ? null : appearance.colorTheme);
  set("font", auto(appearance.fontSet));
  set("surface", auto(appearance.surface));
  set("buttons", auto(appearance.buttons));
  // Lip metal and rim shadow only mean something on lipped buttons.
  const lipped = appearance.buttons === "lipped";
  set("lip", lipped ? appearance.lip : null);
  set("lipShadow", lipped ? appearance.lipShadow : null);
  set("inputs", auto(appearance.inputs));
  set("toggles", auto(appearance.toggles));
}

export function applyUserProfile(profile: UserProfile) {
  const root = document.documentElement;

  const { appearance } = profile;

  root.dataset.theme = resolveTheme(appearance.theme);
  followSystemTheme(profile);

  root.dataset.colorPreset = appearance.colorPreset;

  root.dataset.shape = appearance.shape;

  root.dataset.chromeStyle = appearance.chromeStyle;

  root.dataset.semanticContrast = appearance.semanticContrast;

  root.dataset.textContrast = appearance.textContrast;

  applyDesignAspects(appearance, root);

  applyUiColorOverrides(profile, root);

  for (const [level, color] of Object.entries(PRIORITY_COLOR_DEFAULTS)) {
    root.style.setProperty(`--priority-${level}`, color);
  }

  root.style.setProperty(
    "--board-column-width",
    boardColumnWidthMode(profile.board) === "auto"
      ? AUTO_BOARD_COLUMN_WIDTH
      : `${clampBoardColumnWidth(profile.board.columnWidth)}px`,
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
        columnWidthMode: "custom",
      },
    },

    migrated: true,
  };
}

export type { ThemeMode, ColorPreset, UserProfile };
