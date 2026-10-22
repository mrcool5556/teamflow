import { describe, expect, it } from "vitest";
import { parseDescription } from "../src/lib/descriptionFormat";

describe("parseDescription", () => {
  it("turns markdown images into image segments and keeps links around them", () => {
    const segments = parseDescription(
      "Before ![shot](https://example.com/a.png) see [spec](https://example.com/spec)",
    );
    expect(segments).toEqual([
      { type: "text", value: "Before " },
      { type: "image", alt: "shot", src: "https://example.com/a.png" },
      { type: "text", value: " see " },
      { type: "link", label: "spec", href: "https://example.com/spec" },
    ]);
  });

  it("leaves non-http image sources as text", () => {
    const segments = parseDescription("![x](javascript:alert(1))");
    expect(segments.some((segment) => segment.type === "image")).toBe(false);
  });
});
