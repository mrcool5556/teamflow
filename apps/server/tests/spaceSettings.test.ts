import { describe, expect, it } from "vitest";
import { createDb } from "@teamflow/db";
import { GIB } from "@teamflow/core";
import { loadConfig } from "../src/config.js";
import { getSpaceSettings, updateSpaceSettings } from "../src/lib/spaceSettings.js";
import { ApiError } from "../src/lib/errors.js";

const STRONG = "a-sufficiently-long-random-secret-value-1234567890";

describe("space settings", () => {
  it("defaults to 1 GB free spaces, 3 per user and a 2 GB disk floor", () => {
    const config = loadConfig({ NODE_ENV: "production", JWT_SECRET: STRONG } as NodeJS.ProcessEnv);
    expect(config.spaces).toEqual({
      freeSpaceCapBytes: GIB,
      freeSpacesPerUser: 3,
      minFreeDiskBytes: 2 * GIB,
    });
  });

  it("reads overrides from the environment, 0 included", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG,
      TEAMFLOW_FREE_SPACE_CAP_BYTES: "500",
      TEAMFLOW_FREE_SPACES_PER_USER: "1",
      TEAMFLOW_MIN_FREE_DISK_BYTES: "0",
    } as NodeJS.ProcessEnv);
    expect(config.spaces).toEqual({
      freeSpaceCapBytes: 500,
      freeSpacesPerUser: 1,
      minFreeDiskBytes: 0,
    });
  });

  it("stores admin changes over the defaults", () => {
    const db = createDb(":memory:");
    const defaults = getSpaceSettings(db);
    const saved = updateSpaceSettings(db, { freeSpacesPerUser: 5 });
    expect(saved).toEqual({ ...defaults, freeSpacesPerUser: 5 });
    expect(getSpaceSettings(db)).toEqual(saved);
    expect(updateSpaceSettings(db, { freeSpaceCapBytes: 2 * GIB })).toEqual({
      ...saved,
      freeSpaceCapBytes: 2 * GIB,
    });
  });
});

describe("ApiError details", () => {
  it("merges details into the body without overriding error or code", () => {
    const err = new ApiError(413, "Full", "space_storage_full", {
      usedBytes: 1,
      code: "ignored",
    });
    expect(err.toBody()).toEqual({ usedBytes: 1, error: "Full", code: "space_storage_full" });
  });
});
