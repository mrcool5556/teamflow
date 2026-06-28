import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  generateEntityKey,
  rewriteBundleRefs,
  TEAM_BUNDLE_FORMAT,
  TEAM_BUNDLE_VERSION,
  type TeamBundleBoard,
  type TeamBundleFiles,
  type TeamBundleImportOptions,
  type TeamBundleImportResult,
  type TeamBundleIssues,
  type TeamBundleManifest,
  type TeamBundleRefMap,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { filterValidTeamMemberIds, setBoardRowAssignees, setIssueAssignees } from "./assignees.js";
import { getUploadDir } from "./attachments.js";
import { uniqueColumnKey, uniqueRowKey } from "./board.js";

export class TeamBundleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TeamBundleError";
    this.status = status;
  }
}

async function uniqueFileKey(db: Db) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const key = generateEntityKey("file");
    const [existing] = await db
      .select({ id: schema.storedFiles.id })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.key, key))
      .limit(1);
    if (!existing) return key;
  }
  throw new TeamBundleError("Could not allocate file reference", 500);
}

async function loadTeamMemberEmails(db: Db, teamId: string) {
  const rows = await db
    .select({
      userId: schema.teamMembers.userId,
      email: schema.users.email,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .where(eq(schema.teamMembers.teamId, teamId));

  const byEmail = new Map<string, string>();
  for (const row of rows) {
    byEmail.set(row.email.toLowerCase(), row.userId);
  }
  return byEmail;
}

function resolveAssigneeIds(
  emails: string[],
  memberEmails: Map<string, string>,
): string[] {
  const ids: string[] = [];
  for (const email of emails) {
    const userId = memberEmails.get(email.toLowerCase());
    if (userId) ids.push(userId);
  }
  return [...new Set(ids)];
}

function zipToBuffer(
  append: (archive: ZipArchive) => void | Promise<void>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(passthrough);

    Promise.resolve(append(archive))
      .then(() => archive.finalize())
      .catch(reject);
  });
}

function openZipBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new TeamBundleError("Invalid bundle zip"));
      else resolve(zipfile);
    });
  });
}

async function readZipEntries(buffer: Buffer) {
  const zipfile = await openZipBuffer(buffer);
  const entries = new Map<string, Buffer>();

  await new Promise<void>((resolve, reject) => {
    zipfile.on("entry", (entry) => {
      if (/\/$/.test(entry.fileName)) {
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new TeamBundleError("Failed to read bundle entry"));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          entries.set(entry.fileName.replace(/\\/g, "/"), Buffer.concat(chunks));
          zipfile.readEntry();
        });
        stream.on("error", reject);
      });
    });

    zipfile.on("end", () => resolve());
    zipfile.on("error", reject);
    zipfile.readEntry();
  });

  return entries;
}

function readJsonEntry<T>(entries: Map<string, Buffer>, name: string): T {
  const raw = entries.get(name);
  if (!raw) throw new TeamBundleError(`Missing ${name} in bundle`);
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    throw new TeamBundleError(`Invalid JSON in ${name}`);
  }
}

function validateManifest(manifest: TeamBundleManifest) {
  if (manifest.format !== TEAM_BUNDLE_FORMAT) {
    throw new TeamBundleError(`Unsupported bundle format: ${manifest.format}`);
  }
  if (manifest.version !== TEAM_BUNDLE_VERSION) {
    throw new TeamBundleError(
      `Unsupported bundle version ${manifest.version} (expected ${TEAM_BUNDLE_VERSION})`,
    );
  }
  if (!manifest.exportId) {
    throw new TeamBundleError("Bundle manifest missing exportId");
  }
}

export async function exportTeamBundle(
  db: Db,
  teamId: string,
  includeFiles: boolean,
): Promise<{ filename: string; buffer: Buffer }> {
  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  if (!team) throw new TeamBundleError("Team not found", 404);

  const rows = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId))
    .orderBy(asc(schema.boardRows.position));

  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.teamId, teamId))
    .orderBy(asc(schema.issueStatuses.position));

  const issues = await db
    .select()
    .from(schema.issues)
    .where(and(eq(schema.issues.teamId, teamId), isNull(schema.issues.deletedAt)));

  const issueIds = issues.map((issue) => issue.id);
  const comments =
    issueIds.length === 0
      ? []
      : await db
          .select({
            id: schema.comments.id,
            issueId: schema.comments.issueId,
            authorId: schema.comments.authorId,
            body: schema.comments.body,
            createdAt: schema.comments.createdAt,
            authorEmail: schema.users.email,
          })
          .from(schema.comments)
          .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
          .where(inArray(schema.comments.issueId, issueIds));

  const rowKeyById = new Map(rows.map((row) => [row.id, row.key]));

  const boardBundle: TeamBundleBoard = {
    rows: [],
    statuses: [],
  };

  const refMap: TeamBundleRefMap = {
    issues: {},
    rows: {},
    columns: {},
    files: {},
  };

  for (const row of rows) {
    refMap.rows[row.key] = { sourceId: row.id };

    const assigneeRows = await db
      .select({ email: schema.users.email })
      .from(schema.boardRowAssignees)
      .innerJoin(schema.users, eq(schema.users.id, schema.boardRowAssignees.userId))
      .where(eq(schema.boardRowAssignees.rowId, row.id));

    boardBundle.rows.push({
      sourceId: row.id,
      key: row.key,
      name: row.name,
      position: row.position,
      color: row.color,
      assigneeEmails: assigneeRows.map((entry) => entry.email),
    });
  }

  for (const status of statuses) {
    const rowKey = rowKeyById.get(status.rowId);
    if (!rowKey) continue;
    refMap.columns[status.key] = { sourceId: status.id, rowKey };
    boardBundle.statuses.push({
      sourceId: status.id,
      rowKey,
      key: status.key,
      name: status.name,
      type: status.type,
      position: status.position,
      color: status.color,
    });
  }

  const issuesBundle: TeamBundleIssues = {
    issues: [],
    comments: [],
    fileLinks: [],
  };

  for (const issue of issues) {
    const rowKey = issue.rowId ? rowKeyById.get(issue.rowId) : null;
    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, issue.statusId))
      .limit(1);

    const identifier = `${team.key}-${issue.number}`;
    refMap.issues[identifier] = { sourceId: issue.id, number: issue.number };

    const assigneeRows = await db
      .select({ email: schema.users.email })
      .from(schema.issueAssignees)
      .innerJoin(schema.users, eq(schema.users.id, schema.issueAssignees.userId))
      .where(eq(schema.issueAssignees.issueId, issue.id));

    issuesBundle.issues.push({
      sourceId: issue.id,
      number: issue.number,
      identifier,
      title: issue.title,
      description: issue.description,
      rowKey: rowKey ?? boardBundle.rows[0]?.key ?? "",
      statusKey: status?.key ?? "",
      priority: issue.priority,
      assigneeEmails: assigneeRows.map((entry) => entry.email),
      boardSort: issue.boardSort,
      timerActiveAt: issue.timerActiveAt,
      timerElapsedSec: issue.timerElapsedSec,
      timerTargetSec: issue.timerTargetSec,
      completedAt: issue.completedAt,
      color: issue.color,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    });
  }

  for (const comment of comments) {
    const issue = issues.find((row) => row.id === comment.issueId);
    if (!issue) continue;
    issuesBundle.comments.push({
      sourceId: comment.id,
      issueSourceId: comment.issueId,
      authorEmail: comment.authorEmail,
      body: comment.body,
      createdAt: comment.createdAt,
    });
  }

  const teamFileIds = new Set<string>();

  const issueFileLinks = await db
    .select({
      issueId: schema.issueFileLinks.issueId,
      fileId: schema.issueFileLinks.fileId,
      rowKey: schema.boardRows.key,
    })
    .from(schema.issueFileLinks)
    .innerJoin(schema.issues, eq(schema.issues.id, schema.issueFileLinks.issueId))
    .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.issues.rowId))
    .where(eq(schema.issues.teamId, teamId));

  for (const link of issueFileLinks) {
    teamFileIds.add(link.fileId);
    issuesBundle.fileLinks.push({
      issueSourceId: link.issueId,
      rowKey: null,
      fileSourceId: link.fileId,
    });
  }

  const rowFileLinks = await db
    .select({
      rowId: schema.rowFileLinks.rowId,
      fileId: schema.rowFileLinks.fileId,
      rowKey: schema.boardRows.key,
    })
    .from(schema.rowFileLinks)
    .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.rowFileLinks.rowId))
    .where(eq(schema.boardRows.teamId, teamId));

  for (const link of rowFileLinks) {
    teamFileIds.add(link.fileId);
    issuesBundle.fileLinks.push({
      issueSourceId: null,
      rowKey: link.rowKey,
      fileSourceId: link.fileId,
    });
  }

  const teamFileIdList = [...teamFileIds];
  const fileRows =
    teamFileIdList.length === 0
      ? []
      : await db
          .select({
            id: schema.storedFiles.id,
            key: schema.storedFiles.key,
            filename: schema.storedFiles.filename,
            mimeType: schema.storedFiles.mimeType,
            sizeBytes: schema.storedFiles.sizeBytes,
            storagePath: schema.storedFiles.storagePath,
          })
          .from(schema.storedFiles)
          .where(
            and(
              inArray(schema.storedFiles.id, teamFileIdList),
              isNull(schema.storedFiles.deletedAt),
            ),
          );

  const filesBundle: TeamBundleFiles = { files: [] };
  const uploadDir = getUploadDir();

  for (const file of fileRows) {
    refMap.files[file.key] = { sourceId: file.id };
    const zipPath = `files/${file.id}/${file.filename}`;
    filesBundle.files.push({
      sourceId: file.id,
      fileRef: file.key,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      zipPath,
    });
  }

  const exportId = randomUUID();
  const manifest: TeamBundleManifest = {
    format: TEAM_BUNDLE_FORMAT,
    version: TEAM_BUNDLE_VERSION,
    exportId,
    exportedAt: new Date().toISOString(),
    source: {
      teamId: team.id,
      teamKey: team.key,
      teamName: team.name,
    },
    options: { includeFiles },
    counts: {
      rows: boardBundle.rows.length,
      statuses: boardBundle.statuses.length,
      issues: issuesBundle.issues.length,
      comments: issuesBundle.comments.length,
      files: filesBundle.files.length,
    },
  };

  const buffer = await zipToBuffer(async (archive) => {
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.append(JSON.stringify(boardBundle, null, 2), { name: "board.json" });
    archive.append(JSON.stringify(issuesBundle, null, 2), { name: "issues.json" });
    archive.append(JSON.stringify(refMap, null, 2), { name: "ref-map.json" });
    archive.append(JSON.stringify(filesBundle, null, 2), { name: "files.json" });

    if (includeFiles) {
      for (const file of filesBundle.files) {
        const source = fileRows.find((row) => row.id === file.sourceId);
        if (!source) continue;
        const absolutePath = path.join(uploadDir, source.storagePath);
        try {
          await fs.access(absolutePath);
          archive.file(absolutePath, { name: file.zipPath });
        } catch {
          // Skip missing binaries; metadata still exported.
        }
      }
    }
  });

  const stamp = manifest.exportedAt.slice(0, 10);
  return {
    filename: `${team.key.toLowerCase()}-bundle-${stamp}.zip`,
    buffer,
  };
}

async function recordEntityMap(
  db: Db,
  importId: string,
  entityType: string,
  sourceId: string,
  targetId: string,
) {
  await db.insert(schema.teamBundleImportEntityMap).values({
    importId,
    entityType,
    sourceId,
    targetId,
  });
}

export async function importTeamBundle(
  db: Db,
  teamId: string,
  userId: string,
  zipBuffer: Buffer,
  options: TeamBundleImportOptions,
): Promise<TeamBundleImportResult> {
  const entries = await readZipEntries(zipBuffer);
  const manifest = readJsonEntry<TeamBundleManifest>(entries, "manifest.json");
  validateManifest(manifest);

  const board = readJsonEntry<TeamBundleBoard>(entries, "board.json");
  const issuesData = readJsonEntry<TeamBundleIssues>(entries, "issues.json");
  const refMapSource = readJsonEntry<TeamBundleRefMap>(entries, "ref-map.json");
  const filesData = entries.has("files.json")
    ? readJsonEntry<TeamBundleFiles>(entries, "files.json")
    : { files: [] };

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  if (!team) throw new TeamBundleError("Team not found", 404);

  const [existingImport] = await db
    .select()
    .from(schema.teamBundleImports)
    .where(
      and(
        eq(schema.teamBundleImports.teamId, teamId),
        eq(schema.teamBundleImports.exportId, manifest.exportId),
      ),
    )
    .limit(1);

  if (existingImport && !options.force) {
    const maps = await db
      .select()
      .from(schema.teamBundleImportEntityMap)
      .where(eq(schema.teamBundleImportEntityMap.importId, existingImport.id));

    const rewriteMap: Record<string, string> = {};
    for (const [ref, meta] of Object.entries(refMapSource.issues)) {
      const mapped = maps.find(
        (row) => row.entityType === "issue" && row.sourceId === meta.sourceId,
      );
      if (!mapped) continue;
      const [targetIssue] = await db
        .select({ number: schema.issues.number })
        .from(schema.issues)
        .where(eq(schema.issues.id, mapped.targetId))
        .limit(1);
      if (targetIssue) {
        rewriteMap[ref] = `${team.key}-${targetIssue.number}`;
      }
    }

    return {
      exportId: manifest.exportId,
      skipped: true,
      rowsCreated: 0,
      statusesCreated: 0,
      issuesCreated: 0,
      issuesSkipped: issuesData.issues.length,
      commentsCreated: 0,
      filesCreated: 0,
      refMap: rewriteMap,
    };
  }

  if (existingImport && options.force) {
    await db
      .delete(schema.teamBundleImports)
      .where(eq(schema.teamBundleImports.id, existingImport.id));
  }

  const importId = randomUUID();
  await db.insert(schema.teamBundleImports).values({
    id: importId,
    teamId,
    exportId: manifest.exportId,
    sourceTeamKey: manifest.source.teamKey,
  });

  const memberEmails = await loadTeamMemberEmails(db, teamId);
  const rewriteMap: Record<string, string> = {};

  const existingRows = await db
    .select({ position: schema.boardRows.position })
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId));
  let nextRowPosition =
    existingRows.length === 0 ? 0 : Math.max(...existingRows.map((row) => row.position)) + 1;

  const rowIdBySourceId = new Map<string, string>();
  const rowKeyBySourceKey = new Map<string, string>();
  let rowsCreated = 0;

  for (const row of board.rows.sort((a, b) => a.position - b.position)) {
    const rowId = randomUUID();
    const rowKey = await uniqueRowKey(db, teamId);
    rowIdBySourceId.set(row.sourceId, rowId);
    rowKeyBySourceKey.set(row.key, rowKey);
    rewriteMap[row.key] = rowKey;

    await db.insert(schema.boardRows).values({
      id: rowId,
      teamId,
      key: rowKey,
      name: row.name,
      position: nextRowPosition++,
      color: row.color,
    });

    const assigneeIds = await filterValidTeamMemberIds(
      db,
      teamId,
      resolveAssigneeIds(row.assigneeEmails, memberEmails),
    );
    if (assigneeIds.length > 0) {
      await setBoardRowAssignees(db, rowId, assigneeIds);
    }

    await recordEntityMap(db, importId, "row", row.sourceId, rowId);
    rowsCreated += 1;
  }

  const statusIdBySourceId = new Map<string, string>();
  let statusesCreated = 0;

  for (const status of board.statuses.sort((a, b) => a.position - b.position)) {
    const rowId = rowIdBySourceId.get(
      board.rows.find((row) => row.key === status.rowKey)?.sourceId ?? "",
    );
    if (!rowId) continue;

    const statusId = randomUUID();
    const statusKey = await uniqueColumnKey(db, teamId);
    statusIdBySourceId.set(status.sourceId, statusId);
    rewriteMap[status.key] = statusKey;

    await db.insert(schema.issueStatuses).values({
      id: statusId,
      teamId,
      rowId,
      key: statusKey,
      name: status.name,
      type: status.type,
      position: status.position,
      color: status.color,
    });

    await recordEntityMap(db, importId, "status", status.sourceId, statusId);
    statusesCreated += 1;
  }

  let issuesCreated = 0;
  const issueIdBySourceId = new Map<string, string>();

  for (const issue of issuesData.issues) {
    const rowSource = board.rows.find((row) => row.key === issue.rowKey);
    const rowId = rowSource ? rowIdBySourceId.get(rowSource.sourceId) : null;
    const statusSource = board.statuses.find((status) => status.key === issue.statusKey);
    const statusId = statusSource ? statusIdBySourceId.get(statusSource.sourceId) : null;

    if (!rowId || !statusId) continue;

    const [currentTeam] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!currentTeam) break;

    const nextNumber = currentTeam.issueCounter + 1;
    await db
      .update(schema.teams)
      .set({ issueCounter: nextNumber })
      .where(eq(schema.teams.id, teamId));

    const issueId = randomUUID();
    const newIdentifier = `${team.key}-${nextNumber}`;
    issueIdBySourceId.set(issue.sourceId, issueId);
    rewriteMap[issue.identifier] = newIdentifier;
    rewriteMap[`${manifest.source.teamKey}-${issue.number}`] = newIdentifier;
    rewriteMap[`${manifest.source.teamKey.toUpperCase()}-${issue.number}`] = newIdentifier;

    const assigneeIds = await filterValidTeamMemberIds(
      db,
      teamId,
      resolveAssigneeIds(issue.assigneeEmails, memberEmails),
    );

    const now = new Date().toISOString();
    await db.insert(schema.issues).values({
      id: issueId,
      teamId,
      rowId,
      number: nextNumber,
      title: issue.title,
      description: rewriteBundleRefs(issue.description, rewriteMap),
      statusId,
      priority: issue.priority,
      assigneeId: assigneeIds[0] ?? null,
      creatorId: userId,
      boardSort: issue.boardSort,
      timerActiveAt: null,
      timerElapsedSec: issue.timerElapsedSec,
      timerTargetSec: issue.timerTargetSec,
      completedAt: issue.completedAt,
      color: issue.color,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt ?? now,
    });

    if (assigneeIds.length > 0) {
      await setIssueAssignees(db, issueId, assigneeIds);
    }

    await recordEntityMap(db, importId, "issue", issue.sourceId, issueId);
    issuesCreated += 1;
  }

  let commentsCreated = 0;
  const commentIdBySourceId = new Map<string, string>();
  for (const comment of issuesData.comments) {
    const issueId = issueIdBySourceId.get(comment.issueSourceId);
    if (!issueId) continue;

    const authorId = memberEmails.get(comment.authorEmail.toLowerCase()) ?? userId;
    const commentId = randomUUID();
    commentIdBySourceId.set(comment.sourceId, commentId);
    await db.insert(schema.comments).values({
      id: commentId,
      issueId,
      authorId,
      body: rewriteBundleRefs(comment.body, rewriteMap) ?? "",
      createdAt: comment.createdAt,
    });
    await recordEntityMap(db, importId, "comment", comment.sourceId, commentId);
    commentsCreated += 1;
  }

  const fileIdBySourceId = new Map<string, string>();
  let filesCreated = 0;
  const uploadDir = getUploadDir();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "teamflow-import-"));

  try {
    for (const file of filesData.files) {
      const zipEntry = entries.get(file.zipPath);
      if (!zipEntry) continue;

      const tempPath = path.join(tempRoot, `${file.sourceId}_${file.filename}`);
      await fs.writeFile(tempPath, zipEntry);

      const fileId = randomUUID();
      const fileKey = await uniqueFileKey(db);
      rewriteMap[file.fileRef] = fileKey;

      const relativeDir = path.join("import", teamId);
      const storageName = `${fileId}_${file.filename}`;
      const relativePath = path.join(relativeDir, storageName);
      const finalDir = path.join(uploadDir, relativeDir);
      await fs.mkdir(finalDir, { recursive: true });
      await fs.copyFile(tempPath, path.join(uploadDir, relativePath));

      const now = new Date().toISOString();
      await db.insert(schema.storedFiles).values({
        id: fileId,
        uploaderId: userId,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storagePath: relativePath,
        key: fileKey,
        createdAt: now,
      });

      fileIdBySourceId.set(file.sourceId, fileId);
      await recordEntityMap(db, importId, "file", file.sourceId, fileId);
      filesCreated += 1;
    }

    for (const link of issuesData.fileLinks) {
      const fileId = fileIdBySourceId.get(link.fileSourceId);
      if (!fileId) continue;

      if (link.issueSourceId) {
        const issueId = issueIdBySourceId.get(link.issueSourceId);
        if (!issueId) continue;
        await db.insert(schema.issueFileLinks).values({
          id: randomUUID(),
          issueId,
          fileId,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      if (link.rowKey) {
        const rowSource = board.rows.find((row) => row.key === link.rowKey);
        const rowId = rowSource ? rowIdBySourceId.get(rowSource.sourceId) : null;
        if (!rowId) continue;
        await db.insert(schema.rowFileLinks).values({
          id: randomUUID(),
          rowId,
          fileId,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  for (const issue of issuesData.issues) {
    const issueId = issueIdBySourceId.get(issue.sourceId);
    if (!issueId) continue;
    const rewritten = rewriteBundleRefs(issue.description, rewriteMap);
    if (rewritten !== issue.description) {
      await db
        .update(schema.issues)
        .set({ description: rewritten })
        .where(eq(schema.issues.id, issueId));
    }
  }

  for (const comment of issuesData.comments) {
    const commentId = commentIdBySourceId.get(comment.sourceId);
    if (!commentId) continue;
    const rewritten = rewriteBundleRefs(comment.body, rewriteMap);
    if (rewritten !== comment.body) {
      await db
        .update(schema.comments)
        .set({ body: rewritten ?? "" })
        .where(eq(schema.comments.id, commentId));
    }
  }

  return {
    exportId: manifest.exportId,
    skipped: false,
    rowsCreated,
    statusesCreated,
    issuesCreated,
    issuesSkipped: 0,
    commentsCreated,
    filesCreated,
    refMap: rewriteMap,
  };
}
