#!/usr/bin/env node
/**
 * Import issues from a Linear list_issues JSON export into Teamflow.
 * Usage: node scripts/import-from-linear.mjs [path-to-export.json]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTeamflowConfig() {
  const configPath = path.join(os.homedir(), ".teamflow", "config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function tfRequest(config, method, apiPath, body) {
  const res = await fetch(`${config.baseUrl}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${method} ${apiPath} → ${res.status}: ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const PRIORITY_MAP = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

const STATUS_TYPE_MAP = {
  backlog: "backlog",
  unstarted: "todo",
  started: "in_progress",
  completed: "done",
  canceled: "canceled",
  duplicate: "canceled",
};

const TEAM_ROW_MAP = {
  AxiomRP: "Custom Scripts",
  HomeflowCRM: "Map WorkHomeFlowCRM",
};

function buildDescription(issue) {
  const parts = [];
  if (issue.description?.trim()) parts.push(issue.description.trim());

  const meta = [
    `**Imported from Linear:** [${issue.id}](${issue.url})`,
    `- Team: ${issue.team}`,
    issue.labels?.length ? `- Labels: ${issue.labels.join(", ")}` : null,
    issue.parentId ? `- Parent: ${issue.parentId}` : null,
    issue.assignee ? `- Assignee: ${issue.assignee}` : null,
    issue.createdBy ? `- Created by: ${issue.createdBy}` : null,
    issue.gitBranchName ? `- Branch: \`${issue.gitBranchName}\`` : null,
  ].filter(Boolean);

  parts.push("---", ...meta);
  return parts.join("\n\n");
}

function mapPriority(issue) {
  const v = issue.priority?.value ?? 0;
  return PRIORITY_MAP[v] ?? "none";
}

async function main() {
  const exportPath =
    process.argv[2] ?? path.join(__dirname, "linear-export.json");
  const raw = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  const issues = raw.issues ?? raw;
  if (!Array.isArray(issues) || issues.length === 0) {
    console.error("No issues found in export");
    process.exit(1);
  }

  const config = loadTeamflowConfig();
  const { teams } = await tfRequest(config, "GET", "/teams");
  const team = teams[0];
  if (!team) throw new Error("No Teamflow team found");

  const { rows } = await tfRequest(config, "GET", `/teams/${team.id}/rows`);
  const rowByName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));

  async function ensureRow(name) {
    const existing = rowByName.get(name.toLowerCase());
    if (existing) return existing;
    const { row } = await tfRequest(config, "POST", `/teams/${team.id}/rows`, {
      name,
    });
    rowByName.set(name.toLowerCase(), row);
    console.log(`Created row: ${name}`);
    return row;
  }

  const statusCache = new Map();

  async function statusForRow(rowId, statusType) {
    const key = `${rowId}:${statusType}`;
    if (statusCache.has(key)) return statusCache.get(key);

    const { statuses } = await tfRequest(
      config,
      "GET",
      `/rows/${rowId}/statuses`,
    );
    const targetType = STATUS_TYPE_MAP[statusType] ?? "backlog";
    const match =
      statuses.find((s) => s.type === targetType) ??
      statuses.find((s) => s.type === "backlog") ??
      statuses[0];
    statusCache.set(key, match.id);
    return match.id;
  }

  const { issues: existing } = await tfRequest(config, "GET", "/issues");
  const importedIds = new Set();
  for (const e of existing) {
    const m = e.description?.match(/Imported from Linear:\*\* \[([A-Z]+-\d+)\]/);
    if (m) importedIds.add(m[1]);
    const m2 = e.title?.match(/^\[([A-Z]+-\d+)\]/);
    if (m2) importedIds.add(m2[1]);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const issue of issues) {
    if (importedIds.has(issue.id)) {
      skipped++;
      continue;
    }

    const rowName = TEAM_ROW_MAP[issue.team] ?? issue.team ?? "Custom Scripts";
    const row = await ensureRow(rowName);
    const statusId = await statusForRow(row.id, issue.statusType ?? "backlog");

    const title = issue.title.startsWith("[")
      ? issue.title
      : `[${issue.id}] ${issue.title}`;

    try {
      await tfRequest(config, "POST", "/issues", {
        teamId: team.id,
        title,
        description: buildDescription(issue),
        rowId: row.id,
        statusId,
        priority: mapPriority(issue),
      });
      importedIds.add(issue.id);
      created++;
      if (created % 10 === 0) console.log(`  … ${created} created`);
    } catch (err) {
      failed++;
      console.error(`Failed ${issue.id}: ${err.message}`);
    }
  }

  console.log(
    `\nDone: ${created} created, ${skipped} skipped (already imported), ${failed} failed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
