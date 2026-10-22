import { describe, expect, it } from "vitest";
import {
  boardColumnWidthMode,
  createDefaultUserProfile,
  DEFAULT_BOARD_COLUMN_WIDTH,
  mergeUserProfile,
  registerSchema,
} from "../src/index.js";

describe("registerSchema", () => {
  it("parses a valid registration", () => {
    const result = registerSchema.safeParse({
      email: "ada@example.com",
      name: "Ada",
      password: "longenough",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad email and short password", () => {
    const result = registerSchema.safeParse({ email: "nope", name: "Ada", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(expect.arrayContaining(["email", "password"]));
    }
  });
});

describe("boardColumnWidthMode", () => {
  it("treats old profiles as auto only when they kept the default width", () => {
    expect(boardColumnWidthMode({ columnWidth: DEFAULT_BOARD_COLUMN_WIDTH })).toBe("auto");
    expect(boardColumnWidthMode({ columnWidth: 300 })).toBe("custom");
    expect(boardColumnWidthMode({ columnWidth: 300, columnWidthMode: "auto" })).toBe("auto");
  });

  it("keeps the mode through a profile merge", () => {
    const merged = mergeUserProfile(createDefaultUserProfile(), {
      board: { columnWidthMode: "custom" },
    });
    expect(merged.board.columnWidthMode).toBe("custom");
  });
});
