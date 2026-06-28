import { z } from "zod";
import { REF_TOKEN_PATTERN } from "./refs.js";

/** Portable team export container format (ZIP with these JSON files). */
export const TEAM_BUNDLE_FORMAT = "teamflow-bundle" as const;
export const TEAM_BUNDLE_VERSION = 1 as const;

export const teamBundleExportQuerySchema = z.object({
  includeFiles: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const teamBundleImportOptionsSchema = z.object({
  force: z.boolean().optional().default(false),
});

export type TeamBundleImportOptions = z.infer<typeof teamBundleImportOptionsSchema>;

export type TeamBundleManifest = {
  format: typeof TEAM_BUNDLE_FORMAT;
  version: typeof TEAM_BUNDLE_VERSION;
  exportId: string;
  exportedAt: string;
  source: {
    teamId: string;
    teamKey: string;
    teamName: string;
  };
  options: {
    includeFiles: boolean;
  };
  counts: {
    rows: number;
    statuses: number;
    issues: number;
    comments: number;
    files: number;
  };
};

export type TeamBundleBoard = {
  rows: Array<{
    sourceId: string;
    key: string;
    name: string;
    position: number;
    color: string | null;
    assigneeEmails: string[];
  }>;
  statuses: Array<{
    sourceId: string;
    rowKey: string;
    key: string;
    name: string;
    type: string;
    position: number;
    color: string | null;
  }>;
};

export type TeamBundleIssues = {
  issues: Array<{
    sourceId: string;
    number: number;
    identifier: string;
    title: string;
    description: string | null;
    rowKey: string;
    statusKey: string;
    priority: string;
    assigneeEmails: string[];
    boardSort: number;
    timerActiveAt: string | null;
    timerElapsedSec: number;
    timerTargetSec: number | null;
    completedAt: string | null;
    color: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  comments: Array<{
    sourceId: string;
    issueSourceId: string;
    authorEmail: string;
    body: string;
    createdAt: string;
  }>;
  fileLinks: Array<{
    issueSourceId: string | null;
    rowKey: string | null;
    fileSourceId: string;
  }>;
};

export type TeamBundleFiles = {
  files: Array<{
    sourceId: string;
    fileRef: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    zipPath: string;
  }>;
};

export type TeamBundleRefMap = {
  issues: Record<string, { sourceId: string; number: number }>;
  rows: Record<string, { sourceId: string }>;
  columns: Record<string, { sourceId: string; rowKey: string }>;
  files: Record<string, { sourceId: string }>;
};

export type TeamBundleImportResult = {
  exportId: string;
  skipped: boolean;
  rowsCreated: number;
  statusesCreated: number;
  issuesCreated: number;
  issuesSkipped: number;
  commentsCreated: number;
  filesCreated: number;
  refMap: Record<string, string>;
};

/** Replace exported refs in text using an old-ref → new-ref map (preserves unknown tokens). */
export function rewriteBundleRefs(
  text: string | null | undefined,
  refMap: Record<string, string>,
): string | null {
  if (text == null) return null;
  if (!text) return text;

  return text.replace(REF_TOKEN_PATTERN, (match) => {
    const direct = refMap[match];
    if (direct) return direct;
    const upper = refMap[match.toUpperCase()];
    if (upper) return upper;
    const lower = refMap[match.toLowerCase()];
    return lower ?? match;
  });
}
