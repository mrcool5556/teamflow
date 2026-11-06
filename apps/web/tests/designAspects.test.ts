import { createDefaultUserProfile, mergeUserProfile, parseUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { resetAppearance } from "../src/lib/appearanceReset";
import { applyUserProfile, markLowPowerDevice } from "../src/profile";
import aspectsCss from "../src/styles/aspects.css?raw";
import cardCss from "../src/styles/card.css?raw";

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

describe("cheap glass", () => {
  it("marks devices with few cores or little memory as low-powered", () => {
    const root = document.documentElement;
    expect(markLowPowerDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(root.dataset.lowPower).toBe("true");
    expect(markLowPowerDevice({ hardwareConcurrency: 12, deviceMemory: 2 })).toBe(true);
    expect(markLowPowerDevice({ hardwareConcurrency: 12, deviceMemory: 16 })).toBe(false);
    expect(root.dataset.lowPower).toBeUndefined();
  });

  it("never blurs issue cards or column cells", () => {
    const blurredCards = [...aspectsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /(^|[^-])backdrop-filter: (?!none)/.test(m[2]!))
      .map((m) => m[1]!)
      .filter((selector) => /\.issue-card|\.column\.cell/.test(selector));
    expect(blurredCards).toEqual([]);
    expect(cardCss).not.toMatch(/\.issue-card[^{]*\{[^}]*backdrop-filter:\s*blur/);
  });
});
