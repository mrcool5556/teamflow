import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const STRONG = "a-sufficiently-long-random-secret-value-1234567890";

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", JWT_SECRET: STRONG, ...overrides } as NodeJS.ProcessEnv;
}

describe("config", () => {
  it("applies defaults when optional variables are unset", () => {
    const config = loadConfig(env());
    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.publicUrl).toBe("http://localhost:3000");
    expect(config.corsOrigins).toEqual([]);
    expect(config.authRateLimit).toBe(10);
    expect(config.trustProxy).toBe(false);
    expect(config.inviteOnly).toBe(false);
    expect(config.smtp).toBeNull();
    expect(config.secretsKey).toBeNull();
    expect(config.botConfigKey).toBeNull();
    expect(config.maintenance.enabled).toBe(false);
    expect(config.maintenance.sudo).toBe(true);
    expect(config.maintenance.backupDir).toBe("/var/backups/teamflow");
    expect(config.bundle.maxEntries).toBe(5000);
    expect(path.isAbsolute(config.uploadDir)).toBe(true);
    expect(path.isAbsolute(config.appDir)).toBe(true);
  });

  it("parses numbers, booleans, lists and URLs", () => {
    const config = loadConfig(
      env({
        PORT: "4010",
        PUBLIC_URL: "https://teamflow.example.com/",
        CORS_ORIGINS: " https://a.example.com/path , https://b.example.com, not a url ",
        TEAMFLOW_AUTH_RATE_LIMIT: "42",
        TEAMFLOW_TRUST_PROXY: "1",
        TEAMFLOW_INVITE_ONLY: "true",
        TEAMFLOW_MAINTENANCE_SUDO: "false",
        TEAMFLOW_INSTANCE_ADMINS: " Admin@Example.com ,, other@example.com ",
        ATTACHMENT_MAX_BYTES: "1024",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_USER: "mailer",
        SMTP_PASS: "pw",
        TEAMFLOW_APP_DIR: "/opt/teamflow",
        TEAMFLOW_BACKUP_DIR: "backups",
        TEAMFLOW_BACKUP_SCRIPT: "/usr/local/lib/teamflow/backup.sh",
      }),
    );
    expect(config.port).toBe(4010);
    expect(config.publicUrl).toBe("https://teamflow.example.com");
    expect(config.corsOrigins).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(config.authRateLimit).toBe(42);
    expect(config.trustProxy).toBe(true);
    expect(config.inviteOnly).toBe(true);
    expect(config.maintenance.sudo).toBe(false);
    expect(config.instanceAdminEmails).toEqual(["admin@example.com", "other@example.com"]);
    expect(config.attachments.defaultBytes).toBe(1024);
    expect(config.smtp).toEqual({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "mailer",
      pass: "pw",
      from: "teamflow@localhost",
    });
    expect(config.appDir).toBe("/opt/teamflow");
    expect(config.maintenance.backupDir).toBe(path.resolve("/opt/teamflow", "backups"));
    expect(config.maintenance.backupScript).toBe("/usr/local/lib/teamflow/backup.sh");
  });

  it("rejects malformed values and names the variable", () => {
    expect(() => loadConfig(env({ PORT: "eighty" }))).toThrow(/PORT/);
    expect(() => loadConfig(env({ ATTACHMENT_MAX_BYTES: "-5" }))).toThrow(/ATTACHMENT_MAX_BYTES/);
    expect(() => loadConfig(env({ TEAMFLOW_TRUST_PROXY: "maybe" }))).toThrow(
      /TEAMFLOW_TRUST_PROXY/,
    );
    expect(() => loadConfig(env({ PUBLIC_URL: "teamflow" }))).toThrow(/PUBLIC_URL/);
  });

  it("keeps the lane-2 secret refusal rules", () => {
    expect(() => loadConfig(env({ JWT_SECRET: undefined }))).toThrow(/JWT_SECRET/);
    expect(() => loadConfig(env({ JWT_SECRET: "change-me-to-a-long-random-string" }))).toThrow(
      /placeholder/,
    );
    expect(() =>
      loadConfig(env({ TEAMFLOW_SECRETS_KEY: "change-me-to-a-long-random-string" })),
    ).toThrow(/TEAMFLOW_SECRETS_KEY/);
    expect(loadConfig(env({ NODE_ENV: "development", JWT_SECRET: undefined })).jwtSecret).toBe(
      "dev-secret",
    );
    expect(
      loadConfig(env({ TEAMFLOW_ALLOW_DEV_SECRET: "1", JWT_SECRET: undefined })).jwtSecret,
    ).toBe("dev-secret");
    expect(loadConfig(env({ TEAMFLOW_SECRETS_KEY: STRONG })).secretsKey).toBe(STRONG);
  });
});
