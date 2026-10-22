import { describe, expect, it } from "vitest";

const cssByFile = import.meta.glob<string>("../src/**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sourceByFile = import.meta.glob<string>("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

const allCss = Object.values(cssByFile).join("\n");

function token(name: string): number {
  const match = allCss.match(new RegExp(`--z-${name}:\\s*(-?\\d+);`));
  if (!match) throw new Error(`missing --z-${name}`);
  return Number(match[1]);
}

describe("layer tokens", () => {
  it("defines the layer scale in ascending order", () => {
    const order = ["base", "sticky", "dropdown", "drawer", "modal", "popover", "toast", "tooltip"];
    const values = order.map(token);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(new Set(values).size).toBe(values.length);
  });

  it("uses tokens for every z-index in the stylesheets", () => {
    const declarations = [...allCss.matchAll(/z-index:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(declarations.length).toBeGreaterThan(0);
    for (const value of declarations) {
      expect(value, `z-index: ${value}`).toMatch(/var\(--z-[a-z]+\)/);
    }
  });

  it("keeps numeric z-index out of component code", () => {
    expect(Object.keys(sourceByFile).length).toBeGreaterThan(0);
    for (const [file, text] of Object.entries(sourceByFile)) {
      expect(text, file).not.toMatch(/zIndex:\s*\d/);
    }
  });

  it("puts popovers above the highest modal offset", () => {
    // Nested modals (lightbox, shared file browser) sit at most 20 above --z-modal.
    expect(token("popover")).toBeGreaterThan(token("modal") + 20);
    expect(token("modal")).toBeGreaterThan(token("drawer") + 10);
  });
});
