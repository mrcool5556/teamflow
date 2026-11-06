import { createDefaultUserProfile, mergeUserProfile, parseUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { resetAppearance } from "../src/lib/appearanceReset";
import { applyUserProfile } from "../src/profile";

const ASPECT_ATTRS = [
  "palette",
  "font",
  "surface",
  "buttons",
  "lip",
  "lipShadow",
  "inputs",
  "toggles",
];

describe("design-your-own profile fields", () => {
  it("loads a profile saved before the fields existed with every aspect on auto", () => {
    const old = {
      version: 1,
      appearance: { theme: "light", chromeStyle: "paper", shape: "sharp" },
      board: { columnWidth: 420 },
    };
    const { appearance } = parseUserProfile(old);
    expect(appearance).toMatchObject({
      theme: "light",
      chromeStyle: "paper",
      colorTheme: "teamflow",
      fontSet: "auto",
      surface: "auto",
      buttons: "auto",
      lip: "gold",
      lipShadow: "none",
      inputs: "auto",
      toggles: "auto",
    });
  });

  it("falls back to the default for a value it does not know", () => {
    const { appearance } = parseUserProfile({
      version: 1,
      appearance: { fontSet: "comic-sans", surface: "glass" },
      board: { columnWidth: 420 },
    });
    expect(appearance.fontSet).toBe("auto");
    expect(appearance.surface).toBe("glass");
  });

  it("puts no aspect attribute on the page for the default look", () => {
    applyUserProfile(createDefaultUserProfile());
    for (const key of ASPECT_ATTRS) expect(document.documentElement.dataset[key]).toBeUndefined();
  });

  it("sets an attribute per chosen aspect, and lip metal only for lipped buttons", () => {
    const root = document.documentElement;
    applyUserProfile(
      mergeUserProfile(createDefaultUserProfile(), {
        appearance: {
          colorTheme: "machined",
          fontSet: "machined",
          surface: "soft-inset",
          buttons: "raised",
          lip: "silver",
          inputs: "sunk",
          toggles: "flap",
        },
      }),
    );
    expect(root.dataset).toMatchObject({
      palette: "machined",
      font: "machined",
      surface: "soft-inset",
      buttons: "raised",
      inputs: "sunk",
      toggles: "flap",
    });
    expect(root.dataset.lip).toBeUndefined();

    applyUserProfile(
      mergeUserProfile(createDefaultUserProfile(), {
        appearance: { buttons: "lipped", lip: "silver", lipShadow: "drop" },
      }),
    );
    expect(root.dataset.lip).toBe("silver");
    expect(root.dataset.lipShadow).toBe("drop");
    expect(root.dataset.palette).toBeUndefined();
  });

  it("resets the aspects with Reset all", () => {
    const custom = mergeUserProfile(createDefaultUserProfile(), {
      appearance: { colorTheme: "cozy", fontSet: "paper", buttons: "cut-paper", toggles: "retro" },
    });
    expect(resetAppearance(custom, "all").appearance).toEqual(
      createDefaultUserProfile().appearance,
    );
    expect(resetAppearance(custom, "shape").appearance.colorTheme).toBe("cozy");
    expect(resetAppearance(custom, "colour").appearance.fontSet).toBe("paper");
  });
});
