import type {
  MailSettingsPublic,
  SetupChecklistPublic,
  SiteSettingsAdminPublic,
} from "@teamflow/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

const sent = vi.hoisted(() => ({ mails: [] as { to: string; subject: string }[], fail: "" }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: { to: string; subject: string }) => {
        if (sent.fail) throw new Error(sent.fail);
        sent.mails.push(mail);
      },
    }),
  },
}));

let app: TestApp;
let admin: RegisteredUser;
let user: RegisteredUser;

beforeAll(async () => {
  app = await bootApp();
  admin = await registerUser(app, { name: "Admin", email: "admin-site@example.test" });
  user = await registerUser(app, { name: "Sam" });
});

afterAll(async () => {
  const { resetSiteSettingsCache } = await import("../src/lib/siteSettings.js");
  resetSiteSettingsCache();
});

describe("access", () => {
  it("is for instance admins only", async () => {
    for (const [method, url] of [
      ["GET", "/instance/site"],
      ["PATCH", "/instance/site"],
      ["GET", "/instance/mail"],
      ["PUT", "/instance/mail"],
      ["DELETE", "/instance/mail"],
      ["POST", "/instance/mail/test"],
      ["GET", "/instance/signup"],
      ["PATCH", "/instance/signup"],
      ["GET", "/instance/setup-checklist"],
      ["PATCH", "/instance/setup-checklist"],
    ] as const) {
      const body = method === "GET" || method === "DELETE" ? undefined : {};
      const res = await api(app, method, url, { token: user.token, body });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
  });
});

describe("site name and address", () => {
  it("suggests the address the request came in on", async () => {
    const res = await api(app, "GET", "/instance/site", {
      token: admin.token,
      headers: { Host: "192.168.1.50:3000" },
    });
    const { site } = await json<{ site: SiteSettingsAdminPublic }>(res);
    expect(site).toMatchObject({
      siteName: "Teamflow",
      publicUrlSource: "default",
      suggestedPublicUrl: "http://192.168.1.50:3000",
    });
  });

  it("ignores X-Forwarded-* unless the proxy is trusted", async () => {
    const res = await api(app, "GET", "/instance/site", {
      token: admin.token,
      headers: {
        Host: "10.0.0.2:3000",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "evil.example",
      },
    });
    expect((await json<{ site: SiteSettingsAdminPublic }>(res)).site.suggestedPublicUrl).toBe(
      "http://10.0.0.2:3000",
    );
  });

  it("saves name and address, and the login page sees the name", async () => {
    const res = await api(app, "PATCH", "/instance/site", {
      token: admin.token,
      body: { siteName: "Toasterland", publicUrl: "https://tf.example.org/" },
    });
    expect(res.status).toBe(200);
    expect((await json<{ site: SiteSettingsAdminPublic }>(res)).site).toMatchObject({
      siteName: "Toasterland",
      publicUrl: "https://tf.example.org",
      publicUrlSource: "saved",
    });
    const config = await json<{ siteName: string }>(await api(app, "GET", "/auth/config"));
    expect(config.siteName).toBe("Toasterland");
  });

  it("refuses an address that is not http(s)", async () => {
    const res = await api(app, "PATCH", "/instance/site", {
      token: admin.token,
      body: { publicUrl: "javascript:alert(1)" },
    });
    expect(res.status).toBe(400);
    const check = await api(app, "GET", "/instance/checks/public-url?url=ftp%3A%2F%2Fx", {
      token: admin.token,
    });
    expect(check.status).toBe(400);
  });
});

describe("email", () => {
  it("saves without returning the password, sends a test, and can be cleared", async () => {
    const res = await api(app, "PUT", "/instance/mail", {
      token: admin.token,
      body: {
        host: "smtp.example.org",
        port: 587,
        security: "starttls",
        user: "mailer",
        password: "s3cret-pass",
      },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("s3cret");
    expect((JSON.parse(text) as { mail: MailSettingsPublic }).mail).toMatchObject({
      configured: true,
      passwordSet: true,
    });

    const test = await api(app, "POST", "/instance/mail/test", { token: admin.token, body: {} });
    expect((await json<{ result: { ok: boolean; to: string } }>(test)).result).toEqual({
      ok: true,
      to: "admin-site@example.test",
      error: null,
    });
    expect(sent.mails.at(-1)?.subject).toBe("Toasterland: test email");

    sent.fail = "535 Authentication failed";
    const failed = await api(app, "POST", "/instance/mail/test", { token: admin.token, body: {} });
    expect(failed.status).toBe(200);
    expect((await json<{ result: { ok: boolean; error: string } }>(failed)).result).toMatchObject({
      ok: false,
      error: "535 Authentication failed",
    });
    sent.fail = "";

    const cleared = await api(app, "DELETE", "/instance/mail", { token: admin.token });
    expect((await json<{ mail: MailSettingsPublic }>(cleared)).mail.configured).toBe(false);
  });
});

describe("sign-up", () => {
  it("switches invite-only on and off", async () => {
    const on = await api(app, "PATCH", "/instance/signup", {
      token: admin.token,
      body: { inviteOnly: true },
    });
    expect((await json<{ signup: { inviteOnly: boolean } }>(on)).signup).toEqual({
      inviteOnly: true,
      source: "saved",
    });
    await api(app, "PATCH", "/instance/signup", {
      token: admin.token,
      body: { inviteOnly: false },
    });
  });
});

describe("setup checklist", () => {
  it("reads the real state and records skipped email and dismissal", async () => {
    let res = await api(app, "GET", "/instance/setup-checklist", { token: admin.token });
    let { checklist } = await json<{ checklist: SetupChecklistPublic }>(res);
    const state = (id: string) => checklist.items.find((item) => item.id === id)?.state;
    expect(state("admin")).toBe("done");
    expect(state("site")).toBe("done"); // saved above
    expect(state("email")).toBe("todo");
    expect(state("storage")).toBe("todo");
    expect(state("backup")).toBe("unavailable"); // maintenance is off in tests
    expect(state("flow")).toBe("done"); // the test users own teams
    expect(checklist.complete).toBe(false);

    res = await api(app, "PATCH", "/instance/setup-checklist", {
      token: admin.token,
      body: { emailSkipped: true, storageReviewed: true, dismissed: true },
    });
    ({ checklist } = await json<{ checklist: SetupChecklistPublic }>(res));
    expect(state("email")).toBe("skipped");
    expect(state("storage")).toBe("done");
    expect(checklist.dismissed).toBe(true);
  });
});
