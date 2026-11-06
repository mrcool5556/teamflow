import { COLOR_THEMES, COLOR_THEME_FIXED_MODE, createDefaultUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/lib/colorContrast";
import { applyUserProfile } from "../src/profile";
import themes from "../src/styles/themes.css?raw";
import tokens from "../src/styles/tokens.css?raw";

/** Custom properties of every rule whose selector is exactly `selector`, later rules winning. */
function tokensOf(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const [, sel, body] of source.matchAll(rule)) {
    if (sel!.replace(/\/\*[\s\S]*?\*\//g, "").trim() !== selector) continue;
    for (const [, key, value] of body!.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      out[key!] = value!.trim();
  }
  return out;
}

const teamflow = {
  dark: tokensOf(tokens, ":root"),
  light: { ...tokensOf(tokens, ":root"), ...tokensOf(tokens, ':root[data-theme="light"]') },
};

type Case = { name: string; t: Record<string, string>; library: boolean };

const cases: Case[] = [
  { name: "Teamflow dark", t: teamflow.dark, library: false },
  { name: "Teamflow light", t: teamflow.light, library: false },
];
for (const theme of COLOR_THEMES) {
  if (theme === "teamflow") continue;
  const fixed = COLOR_THEME_FIXED_MODE[theme];
  for (const mode of fixed ? [fixed] : (["dark", "light"] as const)) {
    const base = `:root[data-palette="${theme}"][data-theme="${mode}"]`;
    const own = { ...teamflow[mode], ...tokensOf(themes, base) };
    cases.push({ name: `${theme} ${mode}`, t: own, library: true });
    for (const level of ["high", "muted"]) {
      cases.push({
        name: `${theme} ${mode}, ${level} text`,
        t: { ...own, ...tokensOf(themes, `${base}[data-text-contrast="${level}"]`) },
        library: true,
      });
    }
  }
}

describe("colour theme contrast", () => {
  it("defines every library theme in themes.css", () => {
    expect(cases.filter((c) => c.library && !c.name.includes(","))).toHaveLength(9);
    for (const c of cases) expect(c.t["--bg"], c.name).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(cases)("$name: body text reads at 4.5:1 on every background", ({ t }) => {
    for (const bg of ["--bg", "--surface", "--panel", "--cell"]) {
      expect(contrastRatio(t["--text"]!, t[bg]!), `--text on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of ["--bg", "--surface", "--panel"]) {
      expect(
        contrastRatio(t["--text-soft"]!, t[bg]!),
        `--text-soft on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
      // Muted is for hints and counts next to stronger text; Teamflow's own dark is 4.4:1.
      expect(contrastRatio(t["--muted"]!, t[bg]!), `--muted on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(cases.filter((c) => c.library))(
    "$name: buttons, links and errors read on the theme",
    ({ t }) => {
      expect(
        contrastRatio(t["--chrome-btn-text"]!, t["--primary"]!),
        "button text",
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t["--accent-text"]!, t["--bg"]!), "accent text").toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(t["--danger-text"]!, t["--surface"]!),
        "error text",
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(t["--border-strong"]!, t["--surface"]!),
        "control border",
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("light or dark partner", () => {
  it("paints a paired theme in the chosen mode and a single-mode theme in its own", () => {
    const root = document.documentElement;
    const profile = createDefaultUserProfile();
    applyUserProfile({
      ...profile,
      appearance: { ...profile.appearance, colorTheme: "machined", theme: "light" },
    });
    expect(root.dataset).toMatchObject({ palette: "machined", theme: "light" });
    applyUserProfile({
      ...profile,
      appearance: { ...profile.appearance, colorTheme: "cozy", theme: "dark" },
    });
    expect(root.dataset).toMatchObject({ palette: "cozy", theme: "light" });
  });

  it("leaves the theme's own accent unless the user picked an accent colour", () => {
    const root = document.documentElement;
    const profile = createDefaultUserProfile();
    applyUserProfile({ ...profile, appearance: { ...profile.appearance, colorTheme: "studio" } });
    expect(root.style.getPropertyValue("--primary")).toBe("");
    applyUserProfile({
      ...profile,
      appearance: { ...profile.appearance, colorTheme: "studio", colorPreset: "ocean" },
    });
    expect(root.style.getPropertyValue("--primary")).toBe("#2563eb");
    applyUserProfile(profile);
    expect(root.style.getPropertyValue("--primary")).toBe("#ff5500");
  });
});
