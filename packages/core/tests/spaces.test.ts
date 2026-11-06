import { describe, expect, it } from "vitest";
import {
  GIB,
  createSpaceSchema,
  formatStorageBytes,
  spaceStorageState,
  updateSpaceSchema,
  updateSpaceSettingsSchema,
} from "../src/index.js";

describe("spaceStorageState", () => {
  it("is ok without a cap, amber from 80%, full at the cap", () => {
    expect(spaceStorageState(10 * GIB, null)).toBe("ok");
    expect(spaceStorageState(0.79 * GIB, GIB)).toBe("ok");
    expect(spaceStorageState(0.8 * GIB, GIB)).toBe("warn");
    expect(spaceStorageState(GIB, GIB)).toBe("full");
    expect(spaceStorageState(2 * GIB, GIB)).toBe("full");
    expect(spaceStorageState(0, 0)).toBe("full");
  });
});

describe("formatStorageBytes", () => {
  it("uses binary units with the precision the admin page shows", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(512)).toBe("512 B");
    expect(formatStorageBytes(2.1 * 1024 * 1024)).toBe("2.1 MB");
    expect(formatStorageBytes(812 * 1024 * 1024)).toBe("812 MB");
    expect(formatStorageBytes(GIB)).toBe("1.00 GB");
  });
});

describe("space schemas", () => {
  it("accepts a capped admin space and a free space without a cap", () => {
    expect(
      createSpaceSchema.parse({ name: "Client", key: "CLI", spaceType: "admin", capBytes: GIB }),
    ).toMatchObject({ capBytes: GIB });
    expect(createSpaceSchema.parse({ name: "F", key: "FR", spaceType: "free" }).capBytes).toBe(
      undefined,
    );
    expect(() =>
      createSpaceSchema.parse({ name: "x", key: "lower", spaceType: "admin" }),
    ).toThrow();
  });

  it("needs at least one change", () => {
    expect(() => updateSpaceSchema.parse({})).toThrow();
    expect(updateSpaceSchema.parse({ capBytes: null })).toEqual({ capBytes: null });
    expect(() => updateSpaceSettingsSchema.parse({})).toThrow();
    expect(() => updateSpaceSettingsSchema.parse({ freeSpaceCapBytes: -1 })).toThrow();
  });
});
