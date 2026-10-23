import { UI_COLOR_PRESET_PALETTES, type UserProfile } from "@teamflow/core";

type Appearance = UserProfile["appearance"];

/** The part of the appearance a look sets; text contrast and team colours stay as they were. */
export type LookSettings = Pick<Appearance, "theme" | "colorPreset" | "chromeStyle" | "shape"> & {
  customColors?: { primary: string; accent: string };
};

/** Colours for the look's miniature card (the look itself is applied through the profile). */
type LookSwatch = {
  background: string;
  surface: string;
  border: string;
  text: string;
  primary: string;
  accent: string;
  radius: string;
  borderWidth: string;
  shadow: string;
};

export type Look = {
  id: string;
  name: string;
  settings: LookSettings;
  swatch: LookSwatch;
};

const { default: base, sunset, ocean, forest } = UI_COLOR_PRESET_PALETTES;

export const LOOKS: Look[] = [
  {
    id: "teamflow",
    name: "Teamflow",
    settings: { theme: "dark", colorPreset: "default", chromeStyle: "industrial", shape: "soft" },
    swatch: {
      background: "#0f0f0f",
      surface: "#1f1f1f",
      border: "#444444",
      text: "#ececec",
      primary: base.primary,
      accent: base.accent,
      radius: "6px",
      borderWidth: "2px",
      shadow: "2px 2px 0 #000",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    settings: { theme: "light", colorPreset: "default", chromeStyle: "classic", shape: "round" },
    swatch: {
      background: "#f3f3f3",
      surface: "#ffffff",
      border: "#a3a3a3",
      text: "#141414",
      primary: base.primary,
      accent: base.accent,
      radius: "10px",
      borderWidth: "2px",
      shadow: "0 1px 3px rgba(0,0,0,.2)",
    },
  },
  {
    id: "calm",
    name: "Calm",
    settings: { theme: "dark", colorPreset: "ocean", chromeStyle: "minimal", shape: "round" },
    swatch: {
      background: "#0f0f0f",
      surface: "#1f1f1f",
      border: "#444444",
      text: "#ececec",
      primary: ocean.primary,
      accent: ocean.accent,
      radius: "10px",
      borderWidth: "1px",
      shadow: "none",
    },
  },
  {
    id: "paper",
    name: "Paper",
    settings: { theme: "light", colorPreset: "sunset", chromeStyle: "paper", shape: "sharp" },
    swatch: {
      background: "#f1e9d6",
      surface: "#fbf6ea",
      border: "#3b3226",
      text: "#2a2117",
      primary: sunset.primary,
      accent: sunset.accent,
      radius: "0",
      borderWidth: "1px",
      shadow: "none",
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    settings: { theme: "dark", colorPreset: "forest", chromeStyle: "terminal", shape: "sharp" },
    swatch: {
      background: "#050a06",
      surface: "#0b140d",
      border: forest.primary,
      text: "#d1fae5",
      primary: forest.primary,
      accent: forest.accent,
      radius: "0",
      borderWidth: "1px",
      shadow: `0 0 6px ${forest.primary}88`,
    },
  },
  {
    id: "neon",
    name: "Neon",
    settings: {
      theme: "dark",
      colorPreset: "custom",
      chromeStyle: "neon",
      shape: "round",
      customColors: { primary: "#ec4899", accent: "#a855f7" },
    },
    swatch: {
      background: "#0b0814",
      surface: "#14101f",
      border: "#a855f7",
      text: "#f5f3ff",
      primary: "#ec4899",
      accent: "#a855f7",
      radius: "10px",
      borderWidth: "1px",
      shadow: "0 0 8px #a855f788",
    },
  },
];

function sameColor(a: string | undefined, b: string) {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

/** How many of a look's settings the appearance shares (custom colours count as one). */
function matchScore(appearance: Appearance, look: Look) {
  const { settings } = look;
  let score = 0;
  if (appearance.theme === settings.theme) score += 1;
  if (appearance.chromeStyle === settings.chromeStyle) score += 1;
  if (appearance.shape === settings.shape) score += 1;
  if (appearance.colorPreset === settings.colorPreset) {
    const colours = settings.customColors;
    if (
      !colours ||
      (sameColor(appearance.customColors.primary, colours.primary) &&
        sameColor(appearance.customColors.accent, colours.accent))
    ) {
      score += 1;
    }
  }
  return score;
}

/** The look the appearance matches exactly, or null when it has been customised. */
export function activeLook(appearance: Appearance): Look | null {
  return LOOKS.find((look) => matchScore(appearance, look) === 4) ?? null;
}

/** The look closest to a customised appearance (for "Back to …"); null if nothing is close. */
export function nearestLook(appearance: Appearance): Look | null {
  let best: Look | null = null;
  let bestScore = 1;
  for (const look of LOOKS) {
    const score = matchScore(appearance, look);
    if (score > bestScore) {
      best = look;
      bestScore = score;
    }
  }
  return best;
}

/** The appearance with a look applied. */
export function applyLook(appearance: Appearance, look: Look): Appearance {
  const { customColors, ...rest } = look.settings;
  return {
    ...appearance,
    ...rest,
    customColors: customColors
      ? { ...appearance.customColors, ...customColors }
      : appearance.customColors,
  };
}
