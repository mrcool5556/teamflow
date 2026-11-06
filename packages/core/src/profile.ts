import { z } from "zod";

export const USER_PROFILE_VERSION = 1 as const;

/** "system" follows the OS light/dark setting; the page itself is always dark or light. */
export const THEME_MODES = ["dark", "light", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export const COLOR_PRESETS = ["default", "sunset", "ocean", "forest", "custom"] as const;
export type ColorPreset = (typeof COLOR_PRESETS)[number];

export const SHAPE_PRESETS = ["sharp", "soft", "round", "octagon"] as const;
export type ShapePreset = (typeof SHAPE_PRESETS)[number];

export const CHROME_STYLES = [
  "industrial",
  "minimal",
  "soft",
  "classic",
  "glass",
  "terminal",
  "paper",
  "neon",
] as const;
export type ChromeStyle = (typeof CHROME_STYLES)[number];

/**
 * Design-your-own aspects (ported from the UIX "make it yours" model). Each one is set on its
 * own; "auto" keeps what the UI style (chromeStyle) already draws, so old profiles look the same.
 */
/** Colour themes. Most come as a dark and light pair picked by `theme`; three have one mode. */
export const COLOR_THEMES = [
  "teamflow",
  "studio",
  "glass",
  "machined",
  "arcade",
  "cozy",
  "retro-console",
] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

/** The only mode a colour theme has, if it has no light/dark partner. */
export const COLOR_THEME_FIXED_MODE: Partial<Record<ColorTheme, ResolvedTheme>> = {
  arcade: "dark",
  cozy: "light",
  "retro-console": "light",
};

export const FONT_SETS = ["auto", "studio", "machined", "paper", "pixel", "neon"] as const;
export type FontSet = (typeof FONT_SETS)[number];

export const SURFACE_STYLES = [
  "auto",
  "flat",
  "soft-inset",
  "indented",
  "glass",
  "paper",
  "bevel",
] as const;
export type SurfaceStyle = (typeof SURFACE_STYLES)[number];

export const BUTTON_STYLES = [
  "auto",
  "flat",
  "raised",
  "inset",
  "lipped",
  "cut-paper",
  "neon",
  "bevel95",
] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const LIP_METALS = ["gold", "silver", "bronze", "ink", "accent"] as const;
export type LipMetal = (typeof LIP_METALS)[number];

export const LIP_SHADOWS = ["none", "drop"] as const;
export type LipShadow = (typeof LIP_SHADOWS)[number];

export const INPUT_STYLES = ["auto", "boxed", "sunk", "underline", "notebook"] as const;
export type InputStyle = (typeof INPUT_STYLES)[number];

export const TOGGLE_STYLES = ["auto", "pill", "flap", "retro"] as const;
export type ToggleStyle = (typeof TOGGLE_STYLES)[number];

export const SEMANTIC_CONTRAST_MODES = ["adapt", "preserve"] as const;
export type SemanticContrastMode = (typeof SEMANTIC_CONTRAST_MODES)[number];

export const TEXT_CONTRAST_PRESETS = ["default", "high", "muted"] as const;
export type TextContrastPreset = (typeof TEXT_CONTRAST_PRESETS)[number];

export const DEFAULT_UI_PRIMARY = "#ff5500";
export const DEFAULT_UI_ACCENT = "#00d8ff";

export const UI_COLOR_PRESET_PALETTES = {
  default: { primary: DEFAULT_UI_PRIMARY, accent: DEFAULT_UI_ACCENT },
  sunset: { primary: "#ff6b35", accent: "#ffb347" },
  ocean: { primary: "#2563eb", accent: "#06b6d4" },
  forest: { primary: "#16a34a", accent: "#84cc16" },
} as const satisfies Record<Exclude<ColorPreset, "custom">, { primary: string; accent: string }>;

export function resolveUiColors(appearance: {
  colorPreset: ColorPreset;
  customColors: { primary?: string; accent?: string };
}) {
  if (appearance.colorPreset === "custom") {
    return {
      primary: appearance.customColors.primary ?? DEFAULT_UI_PRIMARY,
      accent: appearance.customColors.accent ?? DEFAULT_UI_ACCENT,
    };
  }

  return UI_COLOR_PRESET_PALETTES[appearance.colorPreset];
}

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected #RRGGBB hex color");

export const userProfileCustomColorsSchema = z
  .object({
    primary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    text: hexColorSchema.optional(),
    textSoft: hexColorSchema.optional(),
  })
  .default({});

export const DEFAULT_BOARD_COLUMN_WIDTH = 420;
export const MIN_BOARD_COLUMN_WIDTH = 240;
export const MAX_BOARD_COLUMN_WIDTH = 720;
export const BOARD_COLUMN_WIDTH_STEP = 20;
/** "auto" fits four columns in the row's width (between the min and default widths). */
export const BOARD_COLUMN_WIDTH_MODES = ["auto", "custom"] as const;
export type BoardColumnWidthMode = (typeof BOARD_COLUMN_WIDTH_MODES)[number];

export const DEFAULT_CARD_MIN_HEIGHT = 72;
export const MIN_CARD_MIN_HEIGHT = 48;
export const MAX_CARD_MIN_HEIGHT = 200;

export const userProfileBoardSchema = z.object({
  columnWidth: z.number().int().min(MIN_BOARD_COLUMN_WIDTH).max(MAX_BOARD_COLUMN_WIDTH),
  /** Unset on profiles saved before the mode existed; see `boardColumnWidthMode`. */
  columnWidthMode: z.enum(BOARD_COLUMN_WIDTH_MODES).optional(),
  cardMinHeight: z
    .number()
    .int()
    .min(MIN_CARD_MIN_HEIGHT)
    .max(MAX_CARD_MIN_HEIGHT)
    .default(DEFAULT_CARD_MIN_HEIGHT),
  rowHeadersVisible: z.record(z.string(), z.boolean()).default({}),
});

export const userProfileAppearanceSchema = z.object({
  theme: z.enum(THEME_MODES).default("dark"),
  colorPreset: z.enum(COLOR_PRESETS).default("default"),
  customColors: userProfileCustomColorsSchema.default({}),
  shape: z.enum(SHAPE_PRESETS).default("soft"),
  chromeStyle: z.enum(CHROME_STYLES).default("industrial"),
  semanticContrast: z.enum(SEMANTIC_CONTRAST_MODES).default("adapt"),
  textContrast: z.enum(TEXT_CONTRAST_PRESETS).default("default"),
  // Design-your-own aspects. An unknown value (from a newer export) falls back to the default.
  colorTheme: z.enum(COLOR_THEMES).default("teamflow").catch("teamflow"),
  fontSet: z.enum(FONT_SETS).default("auto").catch("auto"),
  surface: z.enum(SURFACE_STYLES).default("auto").catch("auto"),
  buttons: z.enum(BUTTON_STYLES).default("auto").catch("auto"),
  lip: z.enum(LIP_METALS).default("gold").catch("gold"),
  lipShadow: z.enum(LIP_SHADOWS).default("none").catch("none"),
  inputs: z.enum(INPUT_STYLES).default("auto").catch("auto"),
  toggles: z.enum(TOGGLE_STYLES).default("auto").catch("auto"),
});

export const userProfileUiSchema = z.object({
  lastTeamId: z.string().uuid().nullable().optional(),
});

export const userProfileSchema = z.object({
  version: z.literal(USER_PROFILE_VERSION),
  appearance: userProfileAppearanceSchema.default({}),
  board: userProfileBoardSchema,
  ui: userProfileUiSchema.default({}),
});

export const userProfilePatchSchema = z.object({
  appearance: userProfileAppearanceSchema.partial().optional(),
  board: userProfileBoardSchema.partial().optional(),
  ui: userProfileUiSchema.partial().optional(),
});

export const userProfileExportSchema = z.object({
  version: z.literal(USER_PROFILE_VERSION),
  exportedAt: z.string().datetime(),
  exportedBy: z
    .object({
      name: z.string(),
      email: z.string().email(),
    })
    .optional(),
  profile: userProfileSchema,
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserProfilePatch = z.infer<typeof userProfilePatchSchema>;
export type UserProfileExport = z.infer<typeof userProfileExportSchema>;
export type UserProfileCustomColors = z.infer<typeof userProfileCustomColorsSchema>;

export function clampBoardColumnWidth(value: number) {
  return Math.min(
    MAX_BOARD_COLUMN_WIDTH,
    Math.max(
      MIN_BOARD_COLUMN_WIDTH,
      Math.round(value / BOARD_COLUMN_WIDTH_STEP) * BOARD_COLUMN_WIDTH_STEP,
    ),
  );
}

/**
 * Profiles saved before the mode existed count as "auto" only if they kept the default width,
 * so a width someone picked on purpose stays in effect.
 */
export function boardColumnWidthMode(board: {
  columnWidth: number;
  columnWidthMode?: BoardColumnWidthMode;
}): BoardColumnWidthMode {
  if (board.columnWidthMode) return board.columnWidthMode;
  return board.columnWidth === DEFAULT_BOARD_COLUMN_WIDTH ? "auto" : "custom";
}

export function clampCardMinHeight(value: number) {
  return Math.min(MAX_CARD_MIN_HEIGHT, Math.max(MIN_CARD_MIN_HEIGHT, Math.round(value)));
}

export function createDefaultUserProfile(): UserProfile {
  return userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance: {
      theme: "dark",
      colorPreset: "default",
      customColors: {},
      shape: "soft",
      chromeStyle: "industrial",
      semanticContrast: "adapt",
      textContrast: "default",
      colorTheme: "teamflow",
      fontSet: "auto",
      surface: "auto",
      buttons: "auto",
      lip: "gold",
      lipShadow: "none",
      inputs: "auto",
      toggles: "auto",
    },
    board: {
      columnWidth: DEFAULT_BOARD_COLUMN_WIDTH,
      cardMinHeight: DEFAULT_CARD_MIN_HEIGHT,
      rowHeadersVisible: {},
    },
    ui: {},
  });
}

export function mergeUserProfile(current: UserProfile, patch: UserProfilePatch): UserProfile {
  return userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance: {
      ...current.appearance,
      ...patch.appearance,
      customColors: {
        ...current.appearance.customColors,
        ...patch.appearance?.customColors,
      },
    },
    board: {
      ...current.board,
      ...patch.board,
      rowHeadersVisible: {
        ...current.board.rowHeadersVisible,
        ...patch.board?.rowHeadersVisible,
      },
    },
    ui: {
      ...current.ui,
      ...patch.ui,
    },
  });
}

export function parseUserProfile(input: unknown): UserProfile {
  const parsed = userProfileSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const defaults = createDefaultUserProfile();
  if (!input || typeof input !== "object") return defaults;

  const raw = input as Record<string, unknown>;
  const rawAppearance =
    typeof raw.appearance === "object" && raw.appearance
      ? (raw.appearance as Record<string, unknown>)
      : {};
  const appearance = {
    ...defaults.appearance,
    ...rawAppearance,
    customColors: {
      ...defaults.appearance.customColors,
      ...(typeof rawAppearance.customColors === "object" && rawAppearance.customColors
        ? rawAppearance.customColors
        : {}),
    },
  };
  const board =
    typeof raw.board === "object" && raw.board
      ? {
          ...defaults.board,
          ...(raw.board as object),
          rowHeadersVisible: {
            ...defaults.board.rowHeadersVisible,
            ...((raw.board as { rowHeadersVisible?: Record<string, boolean> }).rowHeadersVisible ??
              {}),
          },
        }
      : defaults.board;
  const ui =
    typeof raw.ui === "object" && raw.ui ? { ...defaults.ui, ...(raw.ui as object) } : defaults.ui;

  return userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance,
    board: {
      ...board,
      columnWidth: clampBoardColumnWidth(board.columnWidth),
      cardMinHeight: clampCardMinHeight(board.cardMinHeight),
    },
    ui,
  });
}

export function parseUserProfileImport(input: unknown): UserProfile {
  const exportParsed = userProfileExportSchema.safeParse(input);
  if (exportParsed.success) return exportParsed.data.profile;

  return parseUserProfile(input);
}
