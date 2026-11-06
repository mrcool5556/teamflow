import { FONT_SETS } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import fontsCss from "../src/styles/fonts.css?raw";

const fontFiles = Object.keys(import.meta.glob("../src/assets/fonts/*/*.woff2"));
const licences = Object.keys(import.meta.glob("../src/assets/fonts/*/{OFL,LICENSE}.txt"));
const folder = (path: string) => path.split("/").at(-2);

describe("self-hosted font sets", () => {
  it("points every @font-face at a file that exists", () => {
    const urls = [...fontsCss.matchAll(/url\("\.\.\/assets\/fonts\/([^"]+)"\)/g)].map(
      (m) => `../src/assets/fonts/${m[1]}`,
    );
    expect(urls.length).toBeGreaterThan(10);
    for (const url of urls) expect(fontFiles).toContain(url);
  });

  it("ships a licence next to every font family", () => {
    const licensed = new Set(licences.map(folder));
    for (const file of fontFiles) expect(licensed, file).toContain(folder(file));
  });

  it("defines every font set", () => {
    for (const set of FONT_SETS) {
      if (set === "auto") continue;
      expect(fontsCss).toContain(`[data-font="${set}"] {`);
    }
  });
});
