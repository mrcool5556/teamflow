import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

let app: TestApp;
let owner: RegisteredUser;
let scratch: string;
let uploadDir: string;
let exportZip: Buffer;

function readZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err);
      const out = new Map<string, Buffer>();
      zipfile.on("entry", (entry) => {
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr);
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => resolve(out));
      zipfile.readEntry();
    });
  });
}

function writeZip(entries: Map<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive();
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (c: Buffer) => chunks.push(c));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.pipe(sink);
    for (const [name, data] of entries) archive.append(data, { name });
    void archive.finalize();
  });
}

/** Import needs team.data.transfer (Owner only), so each target is a fresh user's own team. */
async function importBundle(target: RegisteredUser, zip: Buffer) {
  const form = new FormData();
  form.append("bundle", new File([zip], "bundle.zip", { type: "application/zip" }));
  return api(app, "POST", `/teams/${target.teamId}/import`, { token: target.token, body: form });
}

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-bundle-test-"));
  uploadDir = path.join(scratch, "uploads");
  app = await bootApp({ UPLOAD_DIR: uploadDir });
  owner = await registerUser(app);

  const issueRes = await api(app, "POST", "/issues", {
    token: owner.token,
    body: { teamId: owner.teamId, title: "Has a file" },
  });
  const { issue } = await json<{ issue: { id: string } }>(issueRes);
  const form = new FormData();
  form.append("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
  const up = await api(app, "POST", `/issues/${issue.id}/attachments`, {
    token: owner.token,
    body: form,
  });
  expect(up.status).toBe(201);

  const exp = await api(app, "GET", `/teams/${owner.teamId}/export?includeFiles=true`, {
    token: owner.token,
  });
  expect(exp.status).toBe(200);
  exportZip = Buffer.from(await exp.arrayBuffer());
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("team bundle import", () => {
  it("imports an untampered bundle with its file", async () => {
    const target = await registerUser(app);
    const res = await importBundle(target, exportZip);
    expect(res.status).toBe(200);
    const { result } = await json<{ result: { filesCreated: number } }>(res);
    expect(result.filesCreated).toBe(1);
    expect(fs.existsSync(path.join(uploadDir, "import", target.teamId))).toBe(true);
  });

  it("rejects a filename with path traversal and writes nothing outside the upload dir", async () => {
    const entries = await readZip(exportZip);
    const files = JSON.parse(entries.get("files.json")!.toString("utf8")) as {
      files: { filename: string }[];
    };
    files.files[0]!.filename = "../../../../evil.txt";
    entries.set("files.json", Buffer.from(JSON.stringify(files)));
    const tampered = await writeZip(entries);

    const target = await registerUser(app);
    const res = await importBundle(target, tampered);
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toMatch(/filename/);
    expect(fs.existsSync(path.join(scratch, "evil.txt"))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, "evil.txt"))).toBe(false);
  });

  it("rejects a sourceId with a separator and an invalid mimeType", async () => {
    for (const patch of [{ sourceId: "a/b" }, { mimeType: "text/plain; rm -rf /" }]) {
      const entries = await readZip(exportZip);
      const files = JSON.parse(entries.get("files.json")!.toString("utf8")) as {
        files: Record<string, unknown>[];
      };
      Object.assign(files.files[0]!, patch);
      entries.set("files.json", Buffer.from(JSON.stringify(files)));
      const target = await registerUser(app);
      const res = await importBundle(target, await writeZip(entries));
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
  });

  it("caps the number of entries via TEAMFLOW_BUNDLE_MAX_ENTRIES", async () => {
    process.env.TEAMFLOW_BUNDLE_MAX_ENTRIES = "2";
    try {
      const target = await registerUser(app);
      const res = await importBundle(target, exportZip);
      expect(res.status).toBe(413);
    } finally {
      delete process.env.TEAMFLOW_BUNDLE_MAX_ENTRIES;
    }
  });

  it("caps total uncompressed bytes via TEAMFLOW_BUNDLE_MAX_BYTES", async () => {
    process.env.TEAMFLOW_BUNDLE_MAX_BYTES = "10";
    try {
      const target = await registerUser(app);
      const res = await importBundle(target, exportZip);
      expect(res.status).toBe(413);
    } finally {
      delete process.env.TEAMFLOW_BUNDLE_MAX_BYTES;
    }
  });
});
