import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { schema } from "@teamflow/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, joinTeam, json, registerUser, type TestApp } from "./helpers";
import { firstRowId, getStorage, uploadToRow, uploadedFileId } from "./spaceHelpers";

let app: TestApp;
let scratch: string;
let uploadDir: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-delete-forever-test-"));
  uploadDir = path.join(scratch, "uploads");
  app = await bootApp({ UPLOAD_DIR: uploadDir });
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function storedFile(fileId: string) {
  const { db } = await import("../src/db.js");
  return db.select().from(schema.storedFiles).where(eq(schema.storedFiles.id, fileId)).get();
}

/** A space with one 400-byte row file moved to the trash. */
async function trashedFile() {
  const owner = await registerUser(app);
  const rowId = await firstRowId(app, owner.token, owner.teamId);
  const fileId = await uploadedFileId(await uploadToRow(app, owner.token, rowId, 400));
  const trash = await api(app, "DELETE", `/teams/${owner.teamId}/files/${fileId}`, {
    token: owner.token,
  });
  expect(trash.status).toBe(200);
  return { owner, fileId };
}

describe("delete a trashed file forever", () => {
  it("frees the space at once and removes the bytes from disk", async () => {
    const { owner, fileId } = await trashedFile();
    const before = await getStorage(app, owner.token, owner.teamId);
    expect(before.breakdown.trashBytes).toBe(400);
    const onDisk = path.join(uploadDir, (await storedFile(fileId))!.storagePath);
    expect(fs.existsSync(onDisk)).toBe(true);

    const res = await api(app, "DELETE", `/teams/${owner.teamId}/files/${fileId}/forever`, {
      token: owner.token,
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ fileId, freedBytes: 400 });

    const after = await getStorage(app, owner.token, owner.teamId);
    expect(after.usedBytes).toBe(before.usedBytes - 400);
    expect(after.breakdown.trashBytes).toBe(0);
    expect(await storedFile(fileId)).toBeUndefined();
    expect(fs.existsSync(onDisk)).toBe(false);
  });

  it("refuses a member who cannot delete files, and keeps the file", async () => {
    const { owner, fileId } = await trashedFile();
    const viewer = await registerUser(app);
    await joinTeam(app, owner.token, owner.teamId, viewer.token, "viewer");

    const res = await api(app, "DELETE", `/teams/${owner.teamId}/files/${fileId}/forever`, {
      token: viewer.token,
    });
    expect(res.status).toBe(403);
    expect(await storedFile(fileId)).toBeDefined();
    expect((await getStorage(app, owner.token, owner.teamId)).breakdown.trashBytes).toBe(400);
  });

  it("lets any member who can trash files delete them forever", async () => {
    const { owner, fileId } = await trashedFile();
    const member = await registerUser(app);
    await joinTeam(app, owner.token, owner.teamId, member.token, "member");
    const res = await api(app, "DELETE", `/teams/${owner.teamId}/files/${fileId}/forever`, {
      token: member.token,
    });
    expect(res.status).toBe(200);
  });

  it("only takes files that are in the trash, and only from their own space", async () => {
    const owner = await registerUser(app);
    const rowId = await firstRowId(app, owner.token, owner.teamId);
    const fileId = await uploadedFileId(await uploadToRow(app, owner.token, rowId, 10));
    const active = await api(app, "DELETE", `/teams/${owner.teamId}/files/${fileId}/forever`, {
      token: owner.token,
    });
    expect(active.status).toBe(400);

    const other = await trashedFile();
    const elsewhere = await api(
      app,
      "DELETE",
      `/teams/${owner.teamId}/files/${other.fileId}/forever`,
      { token: owner.token },
    );
    expect(elsewhere.status).toBe(404);
    expect(await storedFile(other.fileId)).toBeDefined();
  });
});
