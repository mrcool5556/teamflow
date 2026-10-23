import { createDefaultUserProfile, mergeUserProfile, parseUserProfileImport } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { buildLookExport, parseLookText, withImportedLook } from "../src/lib/appearanceShare";

const mine = mergeUserProfile(createDefaultUserProfile(), {
  board: { rowHeadersVisible: { r1: false } },
  ui: { lastTeamId: "00000000-0000-4000-8000-000000000001" },
});
const theirs = mergeUserProfile(createDefaultUserProfile(), {
  appearance: { chromeStyle: "neon", theme: "light" },
  board: { columnWidth: 500, columnWidthMode: "custom", rowHeadersVisible: { x: true } },
  ui: { lastTeamId: "00000000-0000-4000-8000-000000000002" },
});

describe("share this look", () => {
  it("exports in the profile export format without team-specific bits", () => {
    const exported = buildLookExport(theirs, { name: "Ada", email: "ada@example.com" });
    expect(parseUserProfileImport(exported).appearance.chromeStyle).toBe("neon");
    expect(exported.profile.ui).toEqual({});
    expect(exported.profile.board.rowHeadersVisible).toEqual({});
  });

  it("imports the look and board size but keeps my row headers and last team", () => {
    const text = JSON.stringify(buildLookExport(theirs));
    const next = withImportedLook(mine, parseLookText(text));
    expect(next.appearance).toMatchObject({ chromeStyle: "neon", theme: "light" });
    expect(next.board).toMatchObject({ columnWidth: 500, columnWidthMode: "custom" });
    expect(next.board.rowHeadersVisible).toEqual({ r1: false });
    expect(next.ui.lastTeamId).toBe(mine.ui.lastTeamId);
  });

  it("explains text that is not a look", () => {
    expect(() => parseLookText("hello")).toThrow(/not valid JSON/);
    expect(() => parseLookText("[1,2]")).toThrow(/no appearance/);
  });
});
