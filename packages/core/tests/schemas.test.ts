import { describe, expect, it } from "vitest";
import { registerSchema } from "../src/index.js";

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
