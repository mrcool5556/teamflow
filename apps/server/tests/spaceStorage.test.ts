import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, registerUser, type TestApp } from "./helpers";
import {
  createIssue,
  firstRowId,
  getStorage,
  startSession,
  uploadToIssue,
  uploadToRow,
  uploadedFileId,
} from "./spaceHelpers";

let app: TestApp;
let scratch: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-space-storage-test-"));
  app = await bootApp({ UPLOAD_DIR: path.join(scratch, "uploads") });
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("space storage usage", () => {
  it("counts issue files, row files, trash and uploads in progress, each file once", async () => {
    const user = await registerUser(app);
    const teamId = user.teamId;
    const issueId = await createIssue(app, user.token, teamId);
    const rowId = await firstRowId(app, user.token, teamId);

    const issueFile = await uploadedFileId(await uploadToIssue(app, user.token, issueId, 1000));
    await uploadedFileId(await uploadToRow(app, user.token, rowId, 300));
    const trashed = await uploadedFileId(await uploadToRow(app, user.token, rowId, 50));

    // Linking the issue file into the row again adds no bytes.
    const link = await api(app, "POST", `/rows/${rowId}/attachments/link`, {
      token: user.token,
      body: { fileId: issueFile },
    });
    expect(link.status).toBe(201);

    const del = await api(app, "DELETE", `/teams/${teamId}/files/${trashed}`, {
      token: user.token,
    });
    expect(del.status).toBeLessThan(300);

    const session = await startSession(app, user.token, { issueId }, 9_000_000);
    expect(session.status).toBe(201);

    const storage = await getStorage(app, user.token, teamId);
    expect(storage.breakdown).toEqual({
      issueFilesBytes: 1000,
      rowFilesBytes: 300,
      trashBytes: 50,
      uploadingBytes: 9_000_000,
    });
    expect(storage.usedBytes).toBe(1000 + 300 + 50 + 9_000_000);
  });

  it("keeps counting files of issues in the issue trash", async () => {
    const user = await registerUser(app);
    const issueId = await createIssue(app, user.token, user.teamId);
    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 700));
    const del = await api(app, "DELETE", `/issues/${issueId}`, { token: user.token });
    expect(del.status).toBeLessThan(300);
    expect((await getStorage(app, user.token, user.teamId)).breakdown.issueFilesBytes).toBe(700);
  });

  it("is readable by any member and hidden from outsiders", async () => {
    const owner = await registerUser(app);
    const outsider = await registerUser(app);
    const storage = await getStorage(app, owner.token, owner.teamId);
    expect(storage.usedBytes).toBe(0);
    const res = await api(app, "GET", `/teams/${owner.teamId}/storage`, { token: outsider.token });
    expect(res.status).toBe(403);
  });
});
