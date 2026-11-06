import { UI_COLOR_PRESET_PALETTES, type UserProfile } from "@teamflow/core";

type Appearance = UserProfile["appearance"];

/** Every setting a look decides: a full mix. Text contrast and team colours stay as they were. */
const LOOK_KEYS = [
  "theme",
  "colorPreset",
  "chromeStyle",
  "shape",
  "colorTheme",
  "fontSet",
  "surface",
  "buttons",
  "lip",
  "lipShadow",
  "inputs",
  "toggles",
] as const satisfies readonly (keyof Appearance)[];

type LookKey = (typeof LOOK_KEYS)[number];

export type LookSettings = Pick<Appearance, LookKey> & {
  customColors?: { primary: string; accent: string };
};

/** Design-your-own aspects left on auto: the UI style draws everything, as before. */
const AUTO_ASPECTS = {
  colorTheme: "teamflow",
  fontSet: "auto",
  surface: "auto",
  buttons: "auto",
  lip: "gold",
  lipShadow: "none",
  inputs: "auto",
  toggles: "auto",
} as const satisfies Partial<LookSettings>;

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
    settings: {
      theme: "dark",
      colorPreset: "default",
      chromeStyle: "industrial",
      shape: "soft",
      ...AUTO_ASPECTS,
    },
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
    settings: {
      theme: "light",
      colorPreset: "default",
      chromeStyle: "classic",
      shape: "round",
      ...AUTO_ASPECTS,
    },
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
    settings: {
      theme: "dark",
      colorPreset: "ocean",
      chromeStyle: "minimal",
      shape: "round",
      ...AUTO_ASPECTS,
    },
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
    settings: {
      theme: "light",
      colorPreset: "sunset",
      chromeStyle: "paper",
      shape: "sharp",
      ...AUTO_ASPECTS,
    },
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
    settings: {
      theme: "dark",
      colorPreset: "forest",
      chromeStyle: "terminal",
      shape: "sharp",
      ...AUTO_ASPECTS,
    },
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
      ...AUTO_ASPECTS,
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
  {
    id: "machined",
    name: "Machined",
    settings: {
      theme: "dark",
      colorPreset: "default",
      chromeStyle: "minimal",
      shape: "pill",
      colorTheme: "machined",
      fontSet: "machined",
      surface: "soft-inset",
      buttons: "lipped",
      lip: "gold",
      lipShadow: "none",
      inputs: "sunk",
      toggles: "pill",
    },
    swatch: {
      background: "#07090c",
      surface: "#11161c",
      border: "#6e7984",
      text: "#f2efe8",
      primary: "#e6b84a",
      accent: "#00cfea",
      radius: "12px",
      borderWidth: "0",
      shadow: "inset 3px 4px 10px rgba(0,0,0,.6)",
    },
  },
  {
    id: "paper-desk",
    name: "Paper desk",
    settings: {
      theme: "light",
      colorPreset: "default",
      chromeStyle: "paper",
      shape: "sharp",
      colorTheme: "cozy",
      fontSet: "paper",
      surface: "paper",
      buttons: "cut-paper",
      lip: "gold",
      lipShadow: "none",
      inputs: "notebook",
      toggles: "flap",
    },
    swatch: {
      background: "#fbf4ec",
      surface: "#fffaf4",
      border: "#94785f",
      text: "#2e211a",
      primary: "#b0440f",
      accent: "#2b5d8a",
      radius: "0",
      borderWidth: "0",
      shadow: "2px 3px 0 rgba(30,18,4,.22)",
    },
  },
  {
    id: "retro-95",
    name: "Retro 95",
    settings: {
      theme: "light",
      colorPreset: "default",
      chromeStyle: "classic",
      shape: "sharp",
      colorTheme: "retro-console",
      fontSet: "pixel",
      surface: "bevel",
      buttons: "bevel95",
      lip: "gold",
      lipShadow: "none",
      inputs: "sunk",
      toggles: "retro",
    },
    swatch: {
      background: "#c4c4c8",
      surface: "#d6d6d9",
      border: "#5f5f66",
      text: "#1e1e22",
      primary: "#4a3f8c",
      accent: "#1f4f86",
      radius: "0",
      borderWidth: "0",
      shadow: "inset -1px -1px rgba(0,0,0,.65), inset 1px 1px rgba(255,255,255,.85)",
    },
  },
  {
    id: "synth-night",
    name: "Synth night",
    settings: {
      theme: "dark",
      colorPreset: "default",
      chromeStyle: "glass",
      shape: "round",
      colorTheme: "glass",
      fontSet: "neon",
      surface: "glass",
      buttons: "neon",
      lip: "gold",
      lipShadow: "none",
      inputs: "underline",
      toggles: "pill",
    },
    swatch: {
      background: "#0d0f10",
      surface: "#1c1e1f",
      border: "#7a7c7c",
      text: "#f2f4ee",
      primary: "#d4f53c",
      accent: "#7cc4ff",
      radius: "10px",
      borderWidth: "1px",
      shadow: "0 0 8px #d4f53c66",
    },
  },
];

function sameColor(a: string | undefined, b: string) {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

/** Lip metal and rim shadow only count when the look has lipped buttons. */
function keysFor(look: Look): LookKey[] {
  return look.settings.buttons === "lipped"
    ? [...LOOK_KEYS]
    : LOOK_KEYS.filter((key) => key !== "lip" && key !== "lipShadow");
}

/** How many of a look's settings the appearance shares (custom colours count with the preset). */
function matchScore(appearance: Appearance, look: Look) {
  const { settings } = look;
  let score = 0;
  for (const key of keysFor(look)) {
    if (appearance[key] !== settings[key]) continue;
    if (key === "colorPreset" && settings.customColors) {
      const colours = settings.customColors;
      if (
        !sameColor(appearance.customColors.primary, colours.primary) ||
        !sameColor(appearance.customColors.accent, colours.accent)
      ) {
        continue;
      }
    }
    score += 1;
  }
  return score;
}

/** The look the appearance matches exactly, or null when it has been customised. */
export function activeLook(appearance: Appearance): Look | null {
  return LOOKS.find((look) => matchScore(appearance, look) === keysFor(look).length) ?? null;
}

/**
 * The look closest to a customised appearance (for "Back to …"); null if nothing is close
 * (it must share all but three of a look's settings).
 */
export function nearestLook(appearance: Appearance): Look | null {
  let best: Look | null = null;
  let bestScore = 0;
  for (const look of LOOKS) {
    const score = matchScore(appearance, look) - (keysFor(look).length - 4);
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
