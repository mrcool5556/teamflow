#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { TeamflowClient } from "@teamflow/api-client";

type Config = {
  baseUrl: string;
  token: string;
};

const configPath = path.join(os.homedir(), ".teamflow", "config.json");

function loadConfig(): Config | null {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
  } catch {
    return null;
  }
}

function saveConfig(config: Config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function getClient() {
  const config = loadConfig();
  if (!config?.token || !config?.baseUrl) {
    console.error("Not logged in. Run: teamflow login --url http://localhost:3000");
    process.exit(1);
  }
  return new TeamflowClient({
    baseUrl: config.baseUrl,
    token: config.token,
  });
}

const program = new Command();
program.name("teamflow").description("Teamflow CLI").version("0.1.0");

program
  .command("login")
  .description("Save API URL and token")
  .requiredOption("--url <url>", "Teamflow API base URL")
  .option("--token <token>", "Personal access token or session JWT")
  .option("--email <email>", "Login with email instead of token")
  .option("--password <password>", "Password for email login")
  .action(async (opts) => {
    let token = opts.token as string | undefined;

    if (!token && opts.email && opts.password) {
      const client = new TeamflowClient({ baseUrl: opts.url });
      const result = await client.login({
        email: opts.email,
        password: opts.password,
      });
      token = result.token;
      console.log(`Logged in as ${result.user.name}`);
    }

    if (!token) {
      console.error("Provide --token or --email and --password");
      process.exit(1);
    }

    saveConfig({ baseUrl: opts.url.replace(/\/$/, ""), token: token! });
    console.log(`Saved config to ${configPath}`);
  });

program
  .command("whoami")
  .description("Show current user")
  .action(async () => {
    const client = getClient();
    const { user } = await client.me();
    console.log(`${user.name} <${user.email}>`);
  });

const issues = program.command("issues").description("Issue commands");

issues
  .command("list")
  .description("List issues")
  .option("--team <teamId>", "Filter by team UUID")
  .option("--search <query>", "Search title/description")
  .option("--assignee <userId>", "Filter by assignee UUID")
  .option("--assignee-me", "Filter by current user")
  .option("--row <rowId>", "Filter by board row UUID")
  .action(async (opts) => {
    const client = getClient();
    let assigneeId = opts.assignee as string | undefined;
    if (opts.assigneeMe) {
      const { user } = await client.me();
      assigneeId = user.id;
    }
    const { issues: rows } = await client.listIssues({
      teamId: opts.team,
      search: opts.search,
      assigneeId,
      rowId: opts.row,
    });
    for (const issue of rows) {
      console.log(
        `${issue.identifier}\t[${issue.statusName}]\t${issue.priority}\t${issue.assigneeName ?? "-"}\t${issue.title}`,
      );
    }
  });

issues
  .command("create")
  .description("Create an issue")
  .requiredOption("--team <teamId>", "Team UUID")
  .requiredOption("--title <title>", "Issue title")
  .option("--description <text>", "Issue description")
  .option("--priority <priority>", "none|low|medium|high|urgent", "none")
  .action(async (opts) => {
    const client = getClient();
    const { issue } = await client.createIssue({
      teamId: opts.team,
      title: opts.title,
      description: opts.description,
      priority: opts.priority,
    });
    console.log(`Created ${issue.identifier}: ${issue.title}`);
  });

issues
  .command("update")
  .description("Update an issue")
  .argument("<issueId>", "Issue UUID")
  .option("--status <statusId>", "Status UUID")
  .option("--title <title>", "New title")
  .option("--priority <priority>", "Priority")
  .action(async (issueId, opts) => {
    const client = getClient();
    const { issue } = await client.updateIssue(issueId, {
      statusId: opts.status,
      title: opts.title,
      priority: opts.priority,
    });
    console.log(`Updated ${issue.identifier}`);
  });

issues
  .command("complete")
  .description("Mark issue as Done")
  .argument("<issueId>", "Issue UUID")
  .action(async (issueId) => {
    const client = getClient();
    const { issue } = await client.completeIssue(issueId);
    console.log(`Completed ${issue.identifier}`);
  });

issues
  .command("comment")
  .description("Add a comment")
  .argument("<issueId>", "Issue UUID")
  .requiredOption("--body <text>", "Comment body")
  .action(async (issueId, opts) => {
    const client = getClient();
    const { comment } = await client.addComment(issueId, { body: opts.body });
    console.log(`Comment added at ${comment.createdAt}`);
  });

const board = program.command("board").description("Board commands");

board
  .command("rows")
  .description("List board rows for a team")
  .requiredOption("--team <teamId>", "Team UUID")
  .action(async (opts) => {
    const client = getClient();
    const { rows } = await client.listRows(opts.team);
    for (const row of rows) {
      console.log(
        `${row.id}\t${row.position}\t${row.assigneeName ?? "-"}\t${row.color ?? "-"}\t${row.name}`,
      );
    }
  });

board
  .command("summary")
  .description("Compact board summary")
  .requiredOption("--team <teamId>", "Team UUID")
  .action(async (opts) => {
    const client = getClient();
    const [{ rows }, { statuses }, { issues }] = await Promise.all([
      client.listRows(opts.team),
      client.listStatuses(opts.team),
      client.listIssues({ teamId: opts.team }),
    ]);
    const defaultRowId = rows[0]?.id ?? null;
    console.log(`Team ${opts.team} — ${issues.length} issues\n`);
    for (const row of rows) {
      const rowIssues = issues.filter(
        (issue) => (issue.rowId ?? defaultRowId) === row.id,
      );
      const rowStatuses = statuses
        .filter((status) => status.rowId === row.id)
        .sort((a, b) => a.position - b.position);
      const open = rowIssues.filter((issue) => issue.statusName !== "Done").length;
      console.log(`${row.name} (${open} open / ${rowIssues.length} total)`);
      for (const status of rowStatuses) {
        const count = rowIssues.filter((issue) => issue.statusId === status.id).length;
        if (count > 0) console.log(`  ${status.name}: ${count}`);
      }
      console.log("");
    }
  });

program.parse();
