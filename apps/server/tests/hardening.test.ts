import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";
import { createFileRangeResponse } from "../src/lib/fileStream.js";
import { resetRateLimits } from "../src/lib/httpHardening.js";
import { reloadConfig } from "../src/config.js";

let app: TestApp;
let user: RegisteredUser;
let scratch: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-hardening-"));
  app = await bootApp({
    PUBLIC_URL: "https://teamflow.example.com",
    CORS_ORIGINS: "https://other.example.com",
    UPLOAD_DIR: path.join(scratch, "uploads"),
    TEAMFLOW_TRUST_PROXY: "1",
  });
  user = await registerUser(app);
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("response hardening", () => {
  it("sets X-Content-Type-Options: nosniff on every response", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const missing = await app.request("/nope");
    expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("only reflects allowlisted CORS origins", async () => {
    const evil = await app.request("/health", { headers: { Origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const pub = await app.request("/health", {
      headers: { Origin: "https://teamflow.example.com" },
    });
    expect(pub.headers.get("access-control-allow-origin")).toBe("https://teamflow.example.com");
    const extra = await app.request("/health", {
      headers: { Origin: "https://other.example.com" },
    });
    expect(extra.headers.get("access-control-allow-origin")).toBe("https://other.example.com");
    const dev = await app.request("/health", { headers: { Origin: "http://localhost:5173" } });
    expect(dev.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("rate limits login per client", async () => {
    process.env.TEAMFLOW_AUTH_RATE_LIMIT = "3";
    reloadConfig();
    resetRateLimits();
    try {
      const attempt = (ip: string) =>
        api(app, "POST", "/auth/login", {
          headers: { "x-forwarded-for": ip },
          body: { email: user.email, password: "wrong-password" },
        });
      for (let i = 0; i < 3; i += 1) expect((await attempt("10.0.0.1")).status).toBe(401);
      const blocked = await attempt("10.0.0.1");
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBeTruthy();
      expect(await json(blocked)).toMatchObject({ error: expect.any(String) });
      expect((await attempt("10.0.0.2")).status).toBe(401);
      // Other routes are not affected.
      expect((await api(app, "GET", "/auth/me", { token: user.token })).status).toBe(200);
    } finally {
      process.env.TEAMFLOW_AUTH_RATE_LIMIT = "1000";
      reloadConfig();
      resetRateLimits();
    }
  });

  it("rejects JSON bodies over 1 MB before parsing", async () => {
    const big = JSON.stringify({ email: user.email, password: "x".repeat(1024 * 1024 + 10) });
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: big,
    });
    expect(res.status).toBe(413);
    expect(await json(res)).toEqual({ error: "Request body too large", code: "payload_too_large" });
  });

  it("rejects multipart uploads larger than the configured attachment limit", async () => {
    process.env.ATTACHMENT_MAX_BYTES = "1024";
    process.env.ATTACHMENT_MAX_IMAGE_BYTES = "1024";
    process.env.ATTACHMENT_MAX_VIDEO_BYTES = "1024";
    process.env.ATTACHMENT_MAX_ZIP_BYTES = "1024";
    process.env.TEAMFLOW_BUNDLE_MAX_BYTES = "1024";
    reloadConfig();
    try {
      const { issue } = await json<{ issue: { id: string } }>(
        await api(app, "POST", "/issues", {
          token: user.token,
          body: { teamId: user.teamId, title: "big" },
        }),
      );
      const form = new FormData();
      form.append("file", new File([Buffer.alloc(3 * 1024 * 1024)], "big.bin"));
      const res = await api(app, "POST", `/issues/${issue.id}/attachments`, {
        token: user.token,
        body: form,
      });
      expect(res.status).toBe(413);
    } finally {
      for (const key of [
        "ATTACHMENT_MAX_BYTES",
        "ATTACHMENT_MAX_IMAGE_BYTES",
        "ATTACHMENT_MAX_VIDEO_BYTES",
        "ATTACHMENT_MAX_ZIP_BYTES",
        "TEAMFLOW_BUNDLE_MAX_BYTES",
      ]) {
        delete process.env[key];
      }
      reloadConfig();
    }
  });
});

describe("attachment serving", () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32),
  ]);
  const html = Buffer.from("<script>alert(1)</script>".padEnd(64, " "));

  it("serves genuine images inline using the sniffed type", async () => {
    const file = path.join(scratch, "real.png");
    fs.writeFileSync(file, png);
    const res = await createFileRangeResponse(file, {
      mimeType: "image/png",
      filename: "real.png",
      inline: true,
    });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("never renders inline based on the client-supplied MIME", async () => {
    const file = path.join(scratch, "fake.png");
    fs.writeFileSync(file, html);
    const res = await createFileRangeResponse(file, {
      mimeType: "image/png",
      filename: "fake.png",
      inline: true,
    });
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const asHtml = await createFileRangeResponse(file, {
      mimeType: "text/html",
      filename: "page.html",
      inline: true,
    });
    expect(asHtml.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(asHtml.headers.get("content-type")).not.toBe("text/html");
  });

  it("download route always uses attachment disposition", async () => {
    const { issue } = await json<{ issue: { id: string } }>(
      await api(app, "POST", "/issues", {
        token: user.token,
        body: { teamId: user.teamId, title: "dl" },
      }),
    );
    const form = new FormData();
    form.append("file", new File([html], "page.html", { type: "text/html" }));
    const up = await json<{ attachment: { id: string } }>(
      await api(app, "POST", `/issues/${issue.id}/attachments`, { token: user.token, body: form }),
    );
    const res = await api(app, "GET", `/attachments/${up.attachment.id}/download`, {
      token: user.token,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
