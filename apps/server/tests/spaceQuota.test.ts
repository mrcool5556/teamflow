import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, bootApp, createTeam, json, registerUser, type TestApp } from "./helpers";
import {
  createIssue,
  firstRowId,
  getStorage,
  setSpace,
  startSession,
  uploadToIssue,
  uploadToRow,
  uploadedFileId,
} from "./spaceHelpers";
import { diskProbe } from "../src/lib/disk.js";
import { updateSpaceSettings } from "../src/lib/spaceSettings.js";

let app: TestApp;
let scratch: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-space-quota-test-"));
  app = await bootApp({ UPLOAD_DIR: path.join(scratch, "uploads") });
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

type FullBody = {
  error: string;
  code: string;
  usedBytes: number;
  capBytes: number;
  fileBytes: number;
  remainingBytes: number;
};

/** A user whose General space is capped at `cap` bytes, with an issue and its first row. */
async function cappedSpace(cap: number) {
  const user = await registerUser(app);
  await setSpace(user.teamId, { storageCapBytes: cap });
  const issueId = await createIssue(app, user.token, user.teamId);
  const rowId = await firstRowId(app, user.token, user.teamId);
  return { user, teamId: user.teamId, issueId, rowId };
}

async function expectFull(res: Response, expected: Partial<FullBody>) {
  expect(res.status).toBe(413);
  const body = await json<FullBody>(res);
  expect(body).toMatchObject({ code: "space_storage_full", ...expected });
  return body;
}

function putChunk(token: string, sessionId: string, bytes: number) {
  return api(app, "PUT", `/uploads/${sessionId}/chunks/0`, {
    token,
    body: "x".repeat(bytes),
    headers: { "Content-Type": "application/octet-stream" },
  });
}

describe("direct uploads", () => {
  it("refuses an issue upload that would pass the cap, with the numbers", async () => {
    const { user, issueId } = await cappedSpace(1000);
    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 800));
    const body = await expectFull(await uploadToIssue(app, user.token, issueId, 300), {
      usedBytes: 800,
      capBytes: 1000,
      fileBytes: 300,
      remainingBytes: 200,
    });
    expect(body.error).toMatch(/won't fit: this space has 200 B left/);
    // Exactly filling the cap is allowed; then the space reads as full.
    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 200));
    const full = await expectFull(await uploadToIssue(app, user.token, issueId, 1), {
      remainingBytes: 0,
    });
    expect(full.error).toMatch(/This space is full/);
  });

  it("refuses a row upload that would pass the cap", async () => {
    const { user, rowId } = await cappedSpace(500);
    await expectFull(await uploadToRow(app, user.token, rowId, 501), { remainingBytes: 500 });
    await uploadedFileId(await uploadToRow(app, user.token, rowId, 500));
  });

  it("leaves spaces with no cap alone", async () => {
    const user = await registerUser(app);
    await setSpace(user.teamId, { spaceType: "admin", storageCapBytes: null });
    const issueId = await createIssue(app, user.token, user.teamId);
    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 50_000));
  });

  it("counts trashed files until they are purged", async () => {
    const { user, teamId, rowId } = await cappedSpace(1000);
    const fileId = await uploadedFileId(await uploadToRow(app, user.token, rowId, 900));
    await api(app, "DELETE", `/teams/${teamId}/files/${fileId}`, { token: user.token });
    await expectFull(await uploadToRow(app, user.token, rowId, 200), { usedBytes: 900 });
  });
});

describe("chunked uploads", () => {
  it("checks the cap when a session starts and reserves its full size", async () => {
    const { user, issueId, rowId } = await cappedSpace(1000);
    await expectFull(await startSession(app, user.token, { issueId }, 1001), { fileBytes: 1001 });

    const first = await startSession(app, user.token, { issueId }, 600);
    expect(first.status).toBe(201);
    // A second session cannot use the 600 bytes the first one reserved.
    await expectFull(await startSession(app, user.token, { rowId }, 600), {
      usedBytes: 600,
      remainingBytes: 400,
    });
    expect((await getStorage(app, user.token, user.teamId)).breakdown.uploadingBytes).toBe(600);
  });

  it("checks again at complete, keeps the session when refused, and completes once there is room", async () => {
    const { user, teamId, issueId } = await cappedSpace(1000);
    const started = await startSession(app, user.token, { issueId }, 400);
    expect(started.status).toBe(201);
    const { session } = await json<{ session: { sessionId: string } }>(started);
    expect((await putChunk(user.token, session.sessionId, 400)).status).toBe(200);

    // The admin lowers the cap under what the upload needs.
    await setSpace(teamId, { storageCapBytes: 300 });
    await expectFull(
      await api(app, "POST", `/uploads/${session.sessionId}/complete`, { token: user.token }),
      { usedBytes: 0, capBytes: 300, fileBytes: 400 },
    );
    const resume = await api(app, "GET", `/uploads/${session.sessionId}`, { token: user.token });
    expect(resume.status).toBe(200);

    await setSpace(teamId, { storageCapBytes: 1000 });
    const done = await api(app, "POST", `/uploads/${session.sessionId}/complete`, {
      token: user.token,
    });
    expect(done.status).toBe(201);
    const storage = await getStorage(app, user.token, teamId);
    expect(storage.breakdown).toMatchObject({ issueFilesBytes: 400, uploadingBytes: 0 });
  });
});

describe("links and moves", () => {
  it("still links an existing file when the space is full (no new bytes)", async () => {
    const { user, issueId, rowId } = await cappedSpace(100);
    const fileId = await uploadedFileId(await uploadToRow(app, user.token, rowId, 100));
    const link = await api(app, "POST", `/issues/${issueId}/attachments/link`, {
      token: user.token,
      body: { fileId },
    });
    expect(link.status).toBe(201);
    expect((await getStorage(app, user.token, user.teamId)).usedBytes).toBe(100);
  });

  it("refuses to link or move a file into another space", async () => {
    const { user, issueId } = await cappedSpace(10_000);
    const fileId = await uploadedFileId(await uploadToIssue(app, user.token, issueId, 100));
    const otherTeam = await createTeam(app, user.token, "Other", "OTH");
    const otherIssue = await createIssue(app, user.token, otherTeam);
    const otherRow = await firstRowId(app, user.token, otherTeam);

    const linkIssue = await api(app, "POST", `/issues/${otherIssue}/attachments/link`, {
      token: user.token,
      body: { fileId },
    });
    expect(linkIssue.status).toBeGreaterThanOrEqual(400);
    const linkRow = await api(app, "POST", `/rows/${otherRow}/attachments/link`, {
      token: user.token,
      body: { fileId },
    });
    expect(linkRow.status).toBeGreaterThanOrEqual(400);

    const listRes = await api(app, "GET", `/issues/${issueId}/attachments`, { token: user.token });
    const { attachments } = await json<{ attachments: { id: string }[] }>(listRes);
    const move = await api(
      app,
      "POST",
      `/issues/${issueId}/attachments/${attachments[0]!.id}/move`,
      { token: user.token, body: { targetIssueId: otherIssue } },
    );
    expect(move.status).toBeGreaterThanOrEqual(400);
    expect((await getStorage(app, user.token, otherTeam)).usedBytes).toBe(0);
  });
});

describe("bundle import", () => {
  it("refuses a bundle whose files do not fit and imports nothing", async () => {
    const source = await registerUser(app);
    const sourceIssue = await createIssue(app, source.token, source.teamId, "With file");
    await uploadedFileId(await uploadToIssue(app, source.token, sourceIssue, 2000));
    const exp = await api(app, "GET", `/teams/${source.teamId}/export?includeFiles=true`, {
      token: source.token,
    });
    expect(exp.status).toBe(200);
    const zip = Buffer.from(await exp.arrayBuffer());

    const target = await registerUser(app);
    await setSpace(target.teamId, { storageCapBytes: 1000 });
    const importForm = () => {
      const form = new FormData();
      form.append("bundle", new File([zip], "bundle.zip", { type: "application/zip" }));
      return form;
    };
    await expectFull(
      await api(app, "POST", `/teams/${target.teamId}/import`, {
        token: target.token,
        body: importForm(),
      }),
      { fileBytes: 2000, capBytes: 1000 },
    );
    const issues = await api(app, "GET", `/issues?teamId=${target.teamId}`, {
      token: target.token,
    });
    const { issues: list } = await json<{ issues: unknown[] }>(issues);
    expect(list).toHaveLength(0);

    await setSpace(target.teamId, { storageCapBytes: 5000 });
    const ok = await api(app, "POST", `/teams/${target.teamId}/import`, {
      token: target.token,
      body: importForm(),
    });
    expect(ok.status).toBeLessThan(300);
    expect((await getStorage(app, target.token, target.teamId)).usedBytes).toBe(2000);
  });
});

describe("server free-disk floor", () => {
  it("pauses uploads everywhere, capped or not, when the disk would drop under 2 GB", async () => {
    const user = await registerUser(app);
    await setSpace(user.teamId, { spaceType: "admin", storageCapBytes: null });
    const issueId = await createIssue(app, user.token, user.teamId);
    const GB = 1024 * 1024 * 1024;
    const { db } = await import("../src/db.js");
    updateSpaceSettings(db, { minFreeDiskBytes: 2 * GB });
    vi.spyOn(diskProbe, "read").mockResolvedValue({ totalBytes: 30 * GB, freeBytes: 2 * GB + 50 });

    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 40));
    const refused = await uploadToIssue(app, user.token, issueId, 100);
    expect(refused.status).toBe(507);
    expect(await json(refused)).toMatchObject({ code: "server_storage_low" });
    const session = await startSession(app, user.token, { issueId }, 100);
    expect(session.status).toBe(507);
    expect((await getStorage(app, user.token, user.teamId)).diskLow).toBe(false);

    vi.spyOn(diskProbe, "read").mockResolvedValue({ totalBytes: 30 * GB, freeBytes: GB });
    expect((await getStorage(app, user.token, user.teamId)).diskLow).toBe(true);
    updateSpaceSettings(db, { minFreeDiskBytes: 0 });
  });
});
