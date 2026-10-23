import { createDefaultUserProfile, mergeUserProfile, parseUserProfile } from "@teamflow/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUserProfile, resolveTheme } from "../src/profile";

function mockSystem(light: boolean) {
  const listeners: (() => void)[] = [];
  const matchMedia = vi.fn((query: string) => ({
    matches: query.includes("light") ? light : !light,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: () => {},
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    switchTo(next: boolean) {
      light = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Match system theme", () => {
  it("keeps explicit themes and resolves system from the OS", () => {
    mockSystem(true);
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("system")).toBe("light");
  });

  it("repaints when the OS switches while the theme is system", () => {
    const system = mockSystem(false);
    applyUserProfile(
      mergeUserProfile(createDefaultUserProfile(), { appearance: { theme: "system" } }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    system.switchTo(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("custom text colours", () => {
  it("load from old profiles without error but are no longer applied", () => {
    const old = parseUserProfile({
      ...createDefaultUserProfile(),
      appearance: {
        ...createDefaultUserProfile().appearance,
        colorPreset: "custom",
        customColors: {
          primary: "#112233",
          accent: "#445566",
          text: "#000000",
          textSoft: "#111111",
        },
      },
    });
    expect(old.appearance.customColors.text).toBe("#000000");
    applyUserProfile(old);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--primary")).toBe("#112233");
    expect(style.getPropertyValue("--text")).toBe("");
    expect(style.getPropertyValue("--text-soft")).toBe("");
  });
});
