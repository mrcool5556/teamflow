import { expect } from "vitest";
import { api, json, type TestApp } from "./helpers";

export async function firstRowId(app: TestApp, token: string, teamId: string) {
  const res = await api(app, "GET", `/teams/${teamId}/rows`, { token });
  const { rows } = await json<{ rows: { id: string }[] }>(res);
  return rows[0]!.id;
}

export async function createIssue(app: TestApp, token: string, teamId: string, title = "Issue") {
  const res = await api(app, "POST", "/issues", { token, body: { teamId, title } });
  expect(res.status).toBe(201);
  const { issue } = await json<{ issue: { id: string } }>(res);
  return issue.id;
}

function form(bytes: number, name: string) {
  const data = new FormData();
  data.append("file", new Blob([new Uint8Array(bytes)], { type: "text/plain" }), name);
  return data;
}

/** POST a file of `bytes` zero bytes to an issue; returns the raw response. */
export function uploadToIssue(app: TestApp, token: string, issueId: string, bytes: number) {
  return api(app, "POST", `/issues/${issueId}/attachments`, {
    token,
    body: form(bytes, `issue-${bytes}.txt`),
  });
}

export function uploadToRow(app: TestApp, token: string, rowId: string, bytes: number) {
  return api(app, "POST", `/rows/${rowId}/attachments`, {
    token,
    body: form(bytes, `row-${bytes}.txt`),
  });
}

export async function uploadedFileId(res: Response) {
  expect(res.status).toBe(201);
  const body = await json<{ attachment: { fileId: string } }>(res);
  return body.attachment.fileId;
}

export function startSession(
  app: TestApp,
  token: string,
  target: { issueId: string } | { rowId: string },
  totalBytes: number,
) {
  const path =
    "issueId" in target ? `/issues/${target.issueId}/uploads` : `/rows/${target.rowId}/uploads`;
  return api(app, "POST", path, {
    token,
    body: { filename: "big.bin", mimeType: "application/octet-stream", totalBytes },
  });
}

export type StorageBody = {
  storage: {
    spaceType: string;
    capBytes: number | null;
    usedBytes: number;
    remainingBytes: number | null;
    state: string;
    diskLow: boolean;
    breakdown: {
      issueFilesBytes: number;
      rowFilesBytes: number;
      trashBytes: number;
      uploadingBytes: number;
    };
  };
};

export async function getStorage(app: TestApp, token: string, teamId: string) {
  const res = await api(app, "GET", `/teams/${teamId}/storage`, { token });
  expect(res.status).toBe(200);
  return (await json<StorageBody>(res)).storage;
}

/** Set a team's space type and cap straight in the database (the admin API comes later). */
export async function setSpace(
  teamId: string,
  values: { spaceType?: "admin" | "free"; storageCapBytes?: number | null },
) {
  const { db } = await import("../src/db.js");
  const { schema } = await import("@teamflow/db");
  const { eq } = await import("drizzle-orm");
  db.update(schema.teams).set(values).where(eq(schema.teams.id, teamId)).run();
}
