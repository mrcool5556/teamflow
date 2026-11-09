import { normalisePublicUrl } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, type TestApp } from "./helpers";

let app: TestApp;
type Site = typeof import("../src/lib/siteSettings.js");
let site: Site;

async function reloadWith(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  site.resetSiteSettingsCache();
}

beforeAll(async () => {
  app = await bootApp();
  site = await import("../src/lib/siteSettings.js");
});

afterEach(async () => {
  await reloadWith({
    PUBLIC_URL: undefined,
    TEAMFLOW_SITE_NAME: undefined,
    TEAMFLOW_INVITE_ONLY: undefined,
    SMTP_HOST: undefined,
  });
  const { db } = await import("../src/db.js");
  db.delete(schema.instanceSettings).run();
  site.resetSiteSettingsCache();
});

describe("normalisePublicUrl", () => {
  it("keeps scheme, host, port and path, drops the trailing slash, query and default port", () => {
    expect(normalisePublicUrl("https://Teamflow.Example.org/")).toBe("https://teamflow.example.org");
    expect(normalisePublicUrl("http://10.0.0.5:3000/tf/?x=1")).toBe("http://10.0.0.5:3000/tf");
    expect(normalisePublicUrl("https://a.example:443")).toBe("https://a.example");
    expect(normalisePublicUrl("ftp://a.example")).toBeNull();
    expect(normalisePublicUrl("https://user:pw@a.example")).toBeNull();
    expect(normalisePublicUrl("teamflow.example.org")).toBeNull();
  });
});

describe("site name and address", () => {
  it("falls back to the built-in defaults", () => {
    expect(site.getSiteSettings()).toEqual({
      siteName: "Teamflow",
      siteNameSource: "default",
      publicUrl: "http://localhost:3000",
      publicUrlSource: "default",
    });
  });

  it("uses a saved address at once, for links and for CORS", async () => {
    site.updateSiteSettings({ siteName: "Toasterland", publicUrl: "https://tf.example.org" });
    expect(site.getPublicUrl()).toBe("https://tf.example.org");
    expect(site.getSiteName()).toBe("Toasterland");
    const res = await api(app, "GET", "/health", { headers: { Origin: "https://tf.example.org" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://tf.example.org");
    const { getPublicBaseUrl } = await import("../src/lib/mail.js");
    expect(getPublicBaseUrl()).toBe("https://tf.example.org");
  });

  it("lets .env win and refuses to save over it", async () => {
    site.updateSiteSettings({ publicUrl: "https://saved.example.org" });
    await reloadWith({ PUBLIC_URL: "https://env.example.org/" });
    expect(site.getSiteSettings()).toMatchObject({
      publicUrl: "https://env.example.org",
      publicUrlSource: "env",
    });
    expect(() => site.updateSiteSettings({ publicUrl: "https://x.example" })).toThrow(/PUBLIC_URL/);
    // The site name is not set in .env, so it can still be saved.
    expect(site.updateSiteSettings({ siteName: "Mine" }).siteName).toBe("Mine");
  });
});

describe("email", () => {
  it("is off until set up", () => {
    expect(site.getMailSettings()).toMatchObject({ configured: false, source: "default" });
    expect(site.getSmtpConfig()).toBeNull();
  });

  it("stores the password encrypted and never returns it", async () => {
    const saved = site.updateMailSettings({
      host: "smtp.example.org",
      port: 587,
      security: "starttls",
      user: "mailer",
      password: "hunter2-secret",
      from: null,
    });
    expect(saved).toMatchObject({ configured: true, source: "saved", passwordSet: true });
    expect(JSON.stringify(saved)).not.toContain("hunter2");

    const { db } = await import("../src/db.js");
    const row = db
      .select()
      .from(schema.instanceSettings)
      .where(eq(schema.instanceSettings.key, "mail"))
      .get();
    expect(row?.value).not.toContain("hunter2");

    expect(site.getSmtpConfig()).toMatchObject({
      host: "smtp.example.org",
      requireTLS: true,
      secure: false,
      user: "mailer",
      pass: "hunter2-secret",
      from: "Teamflow <teamflow@localhost>",
    });

    // Saving again without a password keeps the old one.
    site.updateMailSettings({ host: "smtp2.example.org", port: 465, security: "ssl" });
    expect(site.getSmtpConfig()).toMatchObject({ secure: true, pass: "hunter2-secret" });

    expect(site.clearMailSettings().configured).toBe(false);
    expect(site.getSmtpConfig()).toBeNull();
  });

  it("uses SMTP_* from .env when set, read-only", async () => {
    await reloadWith({ SMTP_HOST: "env-smtp.example.org" });
    expect(site.getMailSettings()).toMatchObject({ source: "env", host: "env-smtp.example.org" });
    expect(() =>
      site.updateMailSettings({ host: "x.example", port: 25, security: "none" }),
    ).toThrow(/SMTP_HOST/);
  });
});

describe("who can sign up", () => {
  it("applies a saved invite-only switch to registration without a restart", async () => {
    site.updateSignupSettings({ inviteOnly: true });
    const res = await api(app, "POST", "/auth/register", {
      body: { email: "nobody@example.test", name: "No One", password: "correct-horse-battery" },
    });
    expect(res.status).toBe(403);
    const configRes = await api(app, "GET", "/auth/config");
    expect(((await configRes.json()) as { inviteOnly: boolean }).inviteOnly).toBe(true);
  });

  it("lets TEAMFLOW_INVITE_ONLY win", async () => {
    site.updateSignupSettings({ inviteOnly: true });
    await reloadWith({ TEAMFLOW_INVITE_ONLY: "false" });
    expect(site.getSignupSettings()).toEqual({ inviteOnly: false, source: "env" });
    expect(() => site.updateSignupSettings({ inviteOnly: true })).toThrow(/TEAMFLOW_INVITE_ONLY/);
  });
});
