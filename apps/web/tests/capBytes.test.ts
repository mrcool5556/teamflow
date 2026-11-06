import { GIB } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { bytesToGbText, capDraftFrom, capFromDraft, gbToBytes } from "../src/routes/admin/capBytes";

describe("cap field helpers", () => {
  it("shows whole, fractional and very small caps without rounding them to 0", () => {
    expect(bytesToGbText(GIB)).toBe("1");
    expect(bytesToGbText(2.5 * GIB)).toBe("2.5");
    expect(bytesToGbText(812 * 1024 * 1024)).toBe("0.793");
    expect(bytesToGbText(3_500_000)).toBe("0.00326");
    expect(capFromDraft(capDraftFrom(3_500_000))).toBeGreaterThan(0);
  });

  it("reads typed GB, with a comma too, and refuses nonsense", () => {
    expect(gbToBytes("1,5")).toBe(1.5 * GIB);
    expect(gbToBytes("0")).toBeNull();
    expect(gbToBytes("abc")).toBeNull();
    expect(capFromDraft({ gbText: "", noLimit: true })).toBeNull();
    expect(capFromDraft({ gbText: "", noLimit: false })).toBe("invalid");
  });
});
