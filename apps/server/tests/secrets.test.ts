import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { isPlaceholderSecret, resolveSecret } from "../src/lib/auth.js";
import { decryptSecret, encryptSecret } from "../src/lib/secretsCrypto.js";
import { reloadConfig } from "../src/config.js";

const STRONG = "a-sufficiently-long-random-secret-value-1234567890";

describe("secret validation", () => {
  it("flags both shipped placeholders, dev-secret, empty and short values", () => {
    expect(isPlaceholderSecret("change-me-in-production-use-long-random-string")).toBe(true);
    expect(isPlaceholderSecret("change-me-to-a-long-random-string")).toBe(true);
    expect(isPlaceholderSecret("dev-secret")).toBe(true);
    expect(isPlaceholderSecret(undefined)).toBe(true);
    expect(isPlaceholderSecret("")).toBe(true);
    expect(isPlaceholderSecret("short")).toBe(true);
    expect(isPlaceholderSecret(STRONG)).toBe(false);
  });

  it("refuses placeholders outside development", () => {
    const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() => resolveSecret("JWT_SECRET", undefined, env)).toThrow(/JWT_SECRET/);
    expect(() => resolveSecret("JWT_SECRET", "change-me-to-a-long-random-string", env)).toThrow(
      /placeholder/,
    );
    expect(resolveSecret("JWT_SECRET", STRONG, env)).toBe(STRONG);
  });

  it("allows a dev fallback only with NODE_ENV=development or TEAMFLOW_ALLOW_DEV_SECRET=1", () => {
    expect(
      resolveSecret("JWT_SECRET", undefined, { NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBe("dev-secret");
    expect(
      resolveSecret("JWT_SECRET", undefined, {
        NODE_ENV: "production",
        TEAMFLOW_ALLOW_DEV_SECRET: "1",
      } as NodeJS.ProcessEnv),
    ).toBe("dev-secret");
  });
});

describe("secrets at rest", () => {
  const saved = { ...process.env };
  afterEach(() => {
    // Assigning undefined to process.env stores the string "undefined"; delete instead.
    for (const key of ["TEAMFLOW_SECRETS_KEY", "JWT_SECRET", "NODE_ENV"] as const) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    reloadConfig();
  });

  it("encrypts with a v2 scrypt-derived key and round-trips", () => {
    process.env.TEAMFLOW_SECRETS_KEY = STRONG;
    reloadConfig();
    const blob = encryptSecret("bot-token-123");
    expect(blob.startsWith("v2:")).toBe(true);
    expect(decryptSecret(blob)).toBe("bot-token-123");
  });

  it("still decrypts v1 blobs written with the old SHA-256 key", () => {
    process.env.TEAMFLOW_SECRETS_KEY = STRONG;
    reloadConfig();
    const legacyKey = createHash("sha256").update(STRONG).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const data = Buffer.concat([cipher.update("legacy-pat", "utf8"), cipher.final()]);
    const blob = [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      data.toString("base64url"),
    ].join(":");
    expect(decryptSecret(blob)).toBe("legacy-pat");
  });

  it("refuses to boot with a placeholder key material outside development", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TEAMFLOW_SECRETS_KEY;
    process.env.JWT_SECRET = "change-me-to-a-long-random-string";
    // Key material is validated when the config loads, so the server never starts like this.
    expect(() => reloadConfig()).toThrow(/placeholder/);
    process.env.JWT_SECRET = STRONG;
    process.env.TEAMFLOW_SECRETS_KEY = "change-me-to-a-long-random-string";
    expect(() => reloadConfig()).toThrow(/TEAMFLOW_SECRETS_KEY/);
  });
});
