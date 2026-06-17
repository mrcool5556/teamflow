import { z } from "zod";

export const USER_PROFILE_VERSION = 1 as const;

export const THEME_MODES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const COLOR_PRESETS = ["default", "sunset", "ocean", "forest"] as const;
export type ColorPreset = (typeof COLOR_PRESETS)[number];

export const DEFAULT_BOARD_COLUMN_WIDTH = 420;
export const MIN_BOARD_COLUMN_WIDTH = 240;
export const MAX_BOARD_COLUMN_WIDTH = 720;
export const BOARD_COLUMN_WIDTH_STEP = 20;

export const DEFAULT_CARD_MIN_HEIGHT = 72;
export const MIN_CARD_MIN_HEIGHT = 48;
export const MAX_CARD_MIN_HEIGHT = 200;

export const userProfileBoardSchema = z.object({
  columnWidth: z.number().int().min(MIN_BOARD_COLUMN_WIDTH).max(MAX_BOARD_COLUMN_WIDTH),
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
});

export const userProfileSchema = z.object({
  version: z.literal(USER_PROFILE_VERSION),
  appearance: userProfileAppearanceSchema.default({}),
  board: userProfileBoardSchema,
});

export const userProfilePatchSchema = z.object({
  appearance: userProfileAppearanceSchema.partial().optional(),
  board: userProfileBoardSchema.partial().optional(),
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

export function clampBoardColumnWidth(value: number) {
  return Math.min(
    MAX_BOARD_COLUMN_WIDTH,
    Math.max(
      MIN_BOARD_COLUMN_WIDTH,
      Math.round(value / BOARD_COLUMN_WIDTH_STEP) * BOARD_COLUMN_WIDTH_STEP,
    ),
  );
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
    },
    board: {
      columnWidth: DEFAULT_BOARD_COLUMN_WIDTH,
      cardMinHeight: DEFAULT_CARD_MIN_HEIGHT,
      rowHeadersVisible: {},
    },
  });
}

export function mergeUserProfile(
  current: UserProfile,
  patch: UserProfilePatch,
): UserProfile {
  return userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance: {
      ...current.appearance,
      ...patch.appearance,
    },
    board: {
      ...current.board,
      ...patch.board,
      rowHeadersVisible: {
        ...current.board.rowHeadersVisible,
        ...patch.board?.rowHeadersVisible,
      },
    },
  });
}

export function parseUserProfile(input: unknown): UserProfile {
  const parsed = userProfileSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const defaults = createDefaultUserProfile();
  if (!input || typeof input !== "object") return defaults;

  const raw = input as Record<string, unknown>;
  const appearance =
    typeof raw.appearance === "object" && raw.appearance
      ? { ...defaults.appearance, ...(raw.appearance as object) }
      : defaults.appearance;
  const board =
    typeof raw.board === "object" && raw.board
      ? {
          ...defaults.board,
          ...(raw.board as object),
          rowHeadersVisible: {
            ...defaults.board.rowHeadersVisible,
            ...((raw.board as { rowHeadersVisible?: Record<string, boolean> })
              .rowHeadersVisible ?? {}),
          },
        }
      : defaults.board;

  return userProfileSchema.parse({
    version: USER_PROFILE_VERSION,
    appearance,
    board: {
      ...board,
      columnWidth: clampBoardColumnWidth(board.columnWidth),
      cardMinHeight: clampCardMinHeight(board.cardMinHeight),
    },
  });
}

export function parseUserProfileImport(input: unknown): UserProfile {
  const exportParsed = userProfileExportSchema.safeParse(input);
  if (exportParsed.success) return exportParsed.data.profile;

  return parseUserProfile(input);
}
