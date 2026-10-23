import { createDefaultUserProfile, mergeUserProfile } from "@teamflow/core";
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
