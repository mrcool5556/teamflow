import type {
  ButtonStyle,
  ChromeStyle,
  ColorPreset,
  ColorTheme,
  FontSet,
  InputStyle,
  LipMetal,
  LipShadow,
  ResolvedTheme,
  ShapePreset,
  SurfaceStyle,
  TextContrastPreset,
  ToggleStyle,
  UserProfile,
} from "@teamflow/core";

type Appearance = UserProfile["appearance"];

export type AspectOption<T extends string> = { value: T; label: string; hint?: string };

/** One chip per colour theme and mode: picking it sets the theme and its light or dark side. */
export type ColourChoice = {
  id: string;
  label: string;
  colorTheme: ColorTheme;
  mode: ResolvedTheme;
  /** Page, panel, text and accent colours for the chip's swatch. */
  swatch: [string, string, string, string];
};

export const COLOUR_CHOICES: ColourChoice[] = [
  {
    id: "teamflow-dark",
    label: "Teamflow Dark",
    colorTheme: "teamflow",
    mode: "dark",
    swatch: ["#0f0f0f", "#1f1f1f", "#ececec", "#ff5500"],
  },
  {
    id: "teamflow-light",
    label: "Teamflow Light",
    colorTheme: "teamflow",
    mode: "light",
    swatch: ["#f3f3f3", "#fafafa", "#141414", "#ff5500"],
  },
  {
    id: "studio-dark",
    label: "Studio Dark",
    colorTheme: "studio",
    mode: "dark",
    swatch: ["#121417", "#202428", "#eceae5", "#4fd1b8"],
  },
  {
    id: "studio-light",
    label: "Studio Light",
    colorTheme: "studio",
    mode: "light",
    swatch: ["#f6f5f2", "#fbfaf9", "#1c1f23", "#0d6e63"],
  },
  {
    id: "arcade",
    label: "Arcade",
    colorTheme: "arcade",
    mode: "dark",
    swatch: ["#0b0d12", "#1a1f2c", "#f5f3ea", "#ffd23f"],
  },
  {
    id: "cozy",
    label: "Cozy",
    colorTheme: "cozy",
    mode: "light",
    swatch: ["#fbf4ec", "#fdf7f0", "#2e211a", "#b0440f"],
  },
  {
    id: "night-glass",
    label: "Night Glass",
    colorTheme: "glass",
    mode: "dark",
    swatch: ["#0d0f10", "#242627", "#f2f4ee", "#d4f53c"],
  },
  {
    id: "lavender-glass",
    label: "Lavender Glass",
    colorTheme: "glass",
    mode: "light",
    swatch: ["#e8e6f3", "#f1f0f8", "#1f1b33", "#5b3fd1"],
  },
  {
    id: "retro-console",
    label: "Retro Console",
    colorTheme: "retro-console",
    mode: "light",
    swatch: ["#c4c4c8", "#ceced1", "#1e1e22", "#4a3f8c"],
  },
  {
    id: "machined",
    label: "Machined",
    colorTheme: "machined",
    mode: "dark",
    swatch: ["#07090c", "#0e1318", "#f2efe8", "#e6b84a"],
  },
  {
    id: "machined-light",
    label: "Machined Light",
    colorTheme: "machined",
    mode: "light",
    swatch: ["#f2efe8", "#f9f8f5", "#15120c", "#9a6f15"],
  },
];

export const ACCENT_OPTIONS: AspectOption<ColorPreset>[] = [
  { value: "default", label: "Theme's own" },
  { value: "sunset", label: "Sunset" },
  { value: "ocean", label: "Ocean" },
  { value: "forest", label: "Forest" },
  { value: "custom", label: "Custom" },
];

export const FONT_OPTIONS: AspectOption<FontSet>[] = [
  { value: "auto", label: "Teamflow", hint: "JetBrains Mono and Space Grotesk" },
  { value: "studio", label: "Studio", hint: "Bricolage Grotesque and Atkinson Hyperlegible" },
  { value: "machined", label: "Machined", hint: "Encode Sans, Manrope and IBM Plex Mono" },
  { value: "paper", label: "Paper", hint: "Typewriter headings, handwriting in notebook fields" },
  { value: "pixel", label: "Pixel", hint: "Pixelify Sans and VT323" },
  { value: "neon", label: "Neon", hint: "Orbitron headings" },
];

export const CORNER_OPTIONS: AspectOption<ShapePreset>[] = [
  { value: "sharp", label: "Sharp" },
  { value: "soft", label: "Slight" },
  { value: "round", label: "Round" },
  { value: "octagon", label: "Octagon" },
  { value: "pill", label: "Pill" },
];

export const SURFACE_OPTIONS: AspectOption<SurfaceStyle>[] = [
  { value: "auto", label: "Auto", hint: "Drawn by the UI style" },
  { value: "flat", label: "Flat" },
  { value: "soft-inset", label: "Soft inset" },
  { value: "indented", label: "Indented" },
  { value: "glass", label: "Glass" },
  { value: "paper", label: "Paper" },
  { value: "bevel", label: "Bevel" },
];

export const BUTTON_OPTIONS: AspectOption<ButtonStyle>[] = [
  { value: "auto", label: "Auto", hint: "Drawn by the UI style" },
  { value: "flat", label: "Flat" },
  { value: "raised", label: "Raised" },
  { value: "inset", label: "Inset" },
  { value: "lipped", label: "Lipped" },
  { value: "cut-paper", label: "Cut paper" },
  { value: "neon", label: "Neon" },
  { value: "bevel95", label: "90s bevel" },
];

export const LIP_OPTIONS: AspectOption<LipMetal>[] = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bronze", label: "Bronze" },
  { value: "ink", label: "Ink" },
  { value: "accent", label: "Theme colour" },
];

export const LIP_SHADOW_OPTIONS: AspectOption<LipShadow>[] = [
  { value: "none", label: "No rim shadow" },
  { value: "drop", label: "Drop shadow" },
];

export const INPUT_OPTIONS: AspectOption<InputStyle>[] = [
  { value: "auto", label: "Auto", hint: "Drawn by the UI style" },
  { value: "boxed", label: "Boxed" },
  { value: "sunk", label: "Sunk" },
  { value: "underline", label: "Underline" },
  { value: "notebook", label: "Notebook" },
];

export const TOGGLE_OPTIONS: AspectOption<ToggleStyle>[] = [
  { value: "auto", label: "Auto", hint: "Drawn by the UI style" },
  { value: "pill", label: "Pill" },
  { value: "flap", label: "Paper flap" },
  { value: "retro", label: "Retro box" },
];

export const UI_STYLE_OPTIONS: AspectOption<ChromeStyle>[] = [
  { value: "industrial", label: "Industrial" },
  { value: "minimal", label: "Minimal" },
  { value: "soft", label: "Soft" },
  { value: "classic", label: "Classic" },
  { value: "glass", label: "Glass" },
  { value: "terminal", label: "Terminal" },
  { value: "paper", label: "Paper" },
  { value: "neon", label: "Neon" },
];

export const TEXT_OPTIONS: AspectOption<TextContrastPreset>[] = [
  { value: "muted", label: "Softer" },
  { value: "default", label: "Normal" },
  { value: "high", label: "Stronger" },
];

export function labelOf<T extends string>(options: AspectOption<T>[], value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** The colour chip the appearance is showing (its theme, painted in its current mode). */
export function currentColourChoice(appearance: Appearance, painted: ResolvedTheme) {
  return (
    COLOUR_CHOICES.find(
      (choice) => choice.colorTheme === appearance.colorTheme && choice.mode === painted,
    ) ?? COLOUR_CHOICES[0]!
  );
}

/** Picking a colour chip: a paired theme also sets light or dark; a one-mode theme keeps it. */
export function chooseColour(appearance: Appearance, choice: ColourChoice): Partial<Appearance> {
  const paired = COLOUR_CHOICES.filter((c) => c.colorTheme === choice.colorTheme).length > 1;
  return paired
    ? { colorTheme: choice.colorTheme, theme: choice.mode }
    : { colorTheme: choice.colorTheme, theme: appearance.theme };
}

/** Whether the colour theme has a light/dark partner the Light or dark switch can move to. */
export function hasPartner(colorTheme: ColorTheme) {
  return COLOUR_CHOICES.filter((choice) => choice.colorTheme === colorTheme).length > 1;
}
