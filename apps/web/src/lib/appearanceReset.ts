import { createDefaultUserProfile, mergeUserProfile, type UserProfile } from "@teamflow/core";

export type ResetScope = "colour" | "shape" | "board" | "all";

export const RESET_LABELS: Record<ResetScope, string> = {
  colour: "Colour reset to default",
  shape: "Shape & style reset to default",
  board: "Board size reset to default",
  all: "Appearance reset to default",
};

/** The profile with one group (or all of Appearance) back at its defaults. */
export function resetAppearance(profile: UserProfile, scope: ResetScope): UserProfile {
  const defaults = createDefaultUserProfile();
  const a = defaults.appearance;
  const colour = {
    theme: a.theme,
    colorPreset: a.colorPreset,
    customColors: {},
    textContrast: a.textContrast,
    semanticContrast: a.semanticContrast,
  };
  const shape = { chromeStyle: a.chromeStyle, shape: a.shape };
  const board = {
    columnWidth: defaults.board.columnWidth,
    columnWidthMode: "auto" as const,
    cardMinHeight: defaults.board.cardMinHeight,
  };
  // mergeUserProfile merges customColors key by key, so clear them explicitly.
  const clearCustom = (next: UserProfile) => ({
    ...next,
    appearance: { ...next.appearance, customColors: {} },
  });
  switch (scope) {
    case "colour":
      return clearCustom(mergeUserProfile(profile, { appearance: colour }));
    case "shape":
      return mergeUserProfile(profile, { appearance: shape });
    case "board":
      return mergeUserProfile(profile, { board });
    case "all":
      return clearCustom(mergeUserProfile(profile, { appearance: { ...colour, ...shape }, board }));
  }
}
