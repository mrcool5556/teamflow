import { createDefaultUserProfile, mergeUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { resetAppearance } from "../src/lib/appearanceReset";

const changed = mergeUserProfile(createDefaultUserProfile(), {
  appearance: {
    theme: "light",
    colorPreset: "custom",
    customColors: { primary: "#123456", accent: "#654321" },
    textContrast: "high",
    semanticContrast: "preserve",
    chromeStyle: "neon",
    shape: "sharp",
  },
  board: {
    columnWidth: 600,
    columnWidthMode: "custom",
    cardMinHeight: 120,
    rowHeadersVisible: { r1: false },
  },
  ui: { lastTeamId: "00000000-0000-4000-8000-000000000001" },
});
const defaults = createDefaultUserProfile();

describe("resetAppearance", () => {
  it("resets colour only, clearing custom colours", () => {
    const next = resetAppearance(changed, "colour");
    expect(next.appearance).toMatchObject({
      theme: defaults.appearance.theme,
      colorPreset: "default",
      customColors: {},
      textContrast: "default",
      semanticContrast: "adapt",
      chromeStyle: "neon",
      shape: "sharp",
    });
    expect(next.board.columnWidth).toBe(600);
  });

  it("resets shape & style only", () => {
    const next = resetAppearance(changed, "shape");
    expect(next.appearance.chromeStyle).toBe(defaults.appearance.chromeStyle);
    expect(next.appearance.shape).toBe(defaults.appearance.shape);
    expect(next.appearance.theme).toBe("light");
  });

  it("resets everything but keeps row header choices and the last team", () => {
    const next = resetAppearance(changed, "all");
    expect(next.appearance).toEqual(defaults.appearance);
    expect(next.board).toMatchObject({
      columnWidth: 420,
      columnWidthMode: "auto",
      cardMinHeight: 72,
    });
    expect(next.board.rowHeadersVisible).toEqual({ r1: false });
    expect(next.ui.lastTeamId).toBe(changed.ui.lastTeamId);
  });
});
