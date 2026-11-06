import { boardColumnWidthMode, type ResolvedTheme, type UserProfile } from "@teamflow/core";
import { contrastRatio } from "./colorContrast";

type Appearance = UserProfile["appearance"];

/** Painted colours the contrast checks need (read from the page; any may be missing). */
export type PaintedColours = {
  bg?: string;
  primary?: string;
  buttonText?: string;
};

export type HeadsUp = { id: string; text: string };

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

/**
 * Weak pairings in a mix, as short lines. They never block a choice. The first five come from
 * the design library's mixer; the rest are Teamflow's own.
 */
export function designHeadsUps(
  profile: Pick<UserProfile, "appearance" | "board">,
  mode: ResolvedTheme,
  colours: PaintedColours = {},
): HeadsUp[] {
  const a: Appearance = profile.appearance;
  const out: HeadsUp[] = [];
  const add = (id: string, text: string) => out.push({ id, text });

  if (a.surface === "glass" && a.colorTheme !== "glass") {
    add(
      "glass-theme",
      "Glass windows look best on Night Glass or Lavender Glass, where there is colour behind them.",
    );
  }
  if (mode === "dark" && (a.surface === "paper" || a.buttons === "cut-paper")) {
    add("paper-dark", "Paper texture darkens on a dark background; it suits a light theme.");
  }
  if (mode === "light" && a.buttons === "neon") {
    add("neon-light", "Neon glow is faint on a light background.");
  }
  if (a.inputs === "notebook" && a.fontSet !== "paper") {
    add(
      "notebook-font",
      "Notebook fields write in handwriting, which looks most at home with the Paper font set.",
    );
  }
  if (a.toggles === "retro" && a.buttons !== "bevel95") {
    add("retro-switch", "The retro box switch pairs best with 90s bevel buttons.");
  }

  if (a.buttons === "lipped" && mode === "light" && (a.lip === "silver" || a.lip === "gold")) {
    add(
      "lip-light",
      "A metal lip stands out less on a light theme; Ink or Theme colour reads better.",
    );
  }
  if (a.fontSet === "pixel") {
    const wide =
      boardColumnWidthMode(profile.board) === "custom" && profile.board.columnWidth >= 400;
    if (!wide) {
      add(
        "pixel-dense",
        "Pixel type is wide, so card titles wrap more; widen columns under Board if cards feel tall.",
      );
    }
  }
  if (
    (a.chromeStyle === "glass" || a.chromeStyle === "neon") &&
    a.surface !== "auto" &&
    !(a.chromeStyle === "glass" && a.surface === "glass")
  ) {
    const style = a.chromeStyle === "glass" ? "Glass" : "Neon";
    add(
      "style-surface",
      `The ${style} UI style adds its own panels and glow, which mix with the windows you picked; Minimal or Classic lets them show as they are.`,
    );
  }

  const { bg, primary, buttonText } = colours;
  if (primary && HEX.test(primary) && bg && HEX.test(bg)) {
    const ratio = contrastRatio(primary, bg);
    if (ratio < 3) {
      add(
        "accent-contrast",
        `Your accent is hard to see on this background (${ratio.toFixed(1)}:1); buttons and selections may be hard to spot.`,
      );
    }
  }
  if (primary && HEX.test(primary) && buttonText && HEX.test(buttonText)) {
    const ratio = contrastRatio(buttonText, primary);
    if (ratio < 4.5) {
      add(
        "button-text-contrast",
        `Text on buttons is hard to read with this accent (${ratio.toFixed(1)}:1).`,
      );
    }
  }
  return out;
}

/** The colours the page is painted with right now (custom properties on <html>). */
export function readPaintedColours(root: HTMLElement = document.documentElement): PaintedColours {
  const style = getComputedStyle(root);
  const read = (name: string) => style.getPropertyValue(name).trim() || undefined;
  return { bg: read("--bg"), primary: read("--primary"), buttonText: read("--chrome-btn-text") };
}
