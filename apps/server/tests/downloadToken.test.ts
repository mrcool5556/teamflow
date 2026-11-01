import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";
import { getJwtSecret } from "../src/lib/auth.js";

let app: TestApp;
let owner: RegisteredUser;
let outsider: RegisteredUser;
let scratch: string;
let zipId: string;
let otherId: string;
const zipBytes = Buffer.from("PK\u0003\u0004".padEnd(4096, "z"));

async function upload(token: string, teamId: string, file: File) {
  const { issue } = await json<{ issue: { id: string } }>(
    await api(app, "POST", "/issues", { token, body: { teamId, title: file.name } }),
  );
  const form = new FormData();
  form.append("file", file);
  const res = await api(app, "POST", `/issues/${issue.id}/attachments`, { token, body: form });
  expect(res.status).toBe(201);
  return (await json<{ attachment: { id: string } }>(res)).attachment.id;
}

async function downloadToken(attachmentId: string, token = owner.token) {
  return api(app, "POST", `/attachments/${attachmentId}/download-token`, { token });
}

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-download-"));
  app = await bootApp({ UPLOAD_DIR: path.join(scratch, "uploads") });
  owner = await registerUser(app);
  outsider = await registerUser(app);
  zipId = await upload(
    owner.token,
    owner.teamId,
    new File([zipBytes], "big.zip", { type: "application/zip" }),
  );
  otherId = await upload(
    owner.token,
    owner.teamId,
    new File(["notes"], "notes.txt", { type: "text/plain" }),
  );
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("download tokens", () => {
  it("issues a token for any file type and downloads with it, no Bearer header", async () => {
    const res = await downloadToken(zipId);
    expect(res.status).toBe(200);
    const body = await json<{ token: string; expiresAt: string; downloadUrl: string }>(res);
    expect(body.downloadUrl).toBe(
      `/attachments/${zipId}/download?token=${encodeURIComponent(body.token)}`,
    );
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

    const dl = await app.request(body.downloadUrl);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(dl.headers.get("content-disposition")).toContain("big.zip");
    expect(Buffer.from(await dl.arrayBuffer()).equals(zipBytes)).toBe(true);
  });

  it("supports Range requests with a token (resumable browser downloads)", async () => {
    const { downloadUrl } = await json<{ downloadUrl: string }>(await downloadToken(zipId));
    const res = await app.request(downloadUrl, { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it("rejects a token for another attachment with 403 forbidden", async () => {
    const { token } = await json<{ token: string }>(await downloadToken(otherId));
    const res = await app.request(
      `/attachments/${zipId}/download?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an expired token with 401 unauthorized", async () => {
    const expired = await new SignJWT({ sub: owner.id, linkId: zipId, type: "stream" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("teamflow")
      .setAudience("teamflow-stream")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(getJwtSecret());
    const res = await app.request(`/attachments/${zipId}/download?token=${expired}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
  });

  it("rejects a garbage or empty token instead of falling back to anonymous access", async () => {
    for (const token of ["not-a-jwt", ""]) {
      const res = await app.request(`/attachments/${zipId}/download?token=${token}`);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "unauthorized" });
    }
  });

  it("does not issue tokens to users outside the team", async () => {
    const res = await downloadToken(zipId, outsider.token);
    expect([403, 404]).toContain(res.status);
  });

  it("refuses a token whose user has lost access to the team", async () => {
    const forged = await new SignJWT({ sub: outsider.id, linkId: zipId, type: "stream" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("teamflow")
      .setAudience("teamflow-stream")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getJwtSecret());
    const res = await app.request(`/attachments/${zipId}/download?token=${forged}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden" });
  });

  it("keeps Bearer downloads working", async () => {
    const res = await api(app, "GET", `/attachments/${zipId}/download`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("gives stream route errors a code too", async () => {
    const res = await app.request(`/attachments/${zipId}/stream`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
  });
});
