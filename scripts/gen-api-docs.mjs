#!/usr/bin/env node
/**
 * Regenerate the route reference in docs/API.md from apps/server/src/routes/*.ts.
 *
 *   node scripts/gen-api-docs.mjs          rewrite docs/API.md
 *   node scripts/gen-api-docs.mjs --check  exit 1 when docs/API.md is out of date
 *
 * Each route file is one sub-app (see src/app.ts). For every `routes.<method>("<path>", ...)`
 * the middleware chain gives auth, write scope, team resolution and permissions; the handler
 * body gives the body/query schema (parseBody / parseQuery / parseWith with a @teamflow/core
 * schema) or the raw body kind.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BEGIN = "<!-- BEGIN GENERATED ROUTES (scripts/gen-api-docs.mjs) -->";
const END = "<!-- END GENERATED ROUTES -->";

/** Order and titles of the sections; matches API_ROUTES in apps/server/src/app.ts. */
const SECTIONS = [
  ["health", "Health"],
  ["auth", "Auth and profile"],
  ["tokens", "API tokens"],
  ["teams", "Teams"],
  ["board", "Board rows and columns"],
  ["members", "Members"],
  ["invites", "Invites"],
  ["roles", "Roles"],
  ["discord", "Discord integration"],
  ["maintenance", "Server maintenance"],
  ["files", "Team files"],
  ["projects", "Projects"],
  ["issues", "Issues"],
  ["comments", "Comments"],
  ["attachments", "Attachments"],
  ["uploads", "Chunked uploads"],
];

/** `routes.<method>("<path>", <middleware chain>, async (c) =>` at the start of a chunk. */
const HEAD_RE =
  /^routes\.(get|post|put|patch|delete)\(\s*"([^"]+)",\s*([\s\S]*?)(?:async )?\(c\) =>/;

function describeAuth(chain, body) {
  if (/\brequireAuth\b/.test(chain)) return "bearer";
  if (/\boptionalAuth\b/.test(chain)) return "optional";
  if (/assertBotConfigKey/.test(body)) return "bot key";
  if (/verifyStreamToken/.test(body)) return "stream token";
  return "none";
}

function describeTeam(chain) {
  const m = chain.match(/loadTeam\(\s*(?:"(\w+)")?\s*\)/);
  if (!m) return "";
  return m[1] ? `member (via ${m[1]})` : "member";
}

function describePermissions(chain) {
  const parts = [];
  for (const m of chain.matchAll(/requirePermission\(\s*(\[[^\]]*\]|"[^"]+")\s*\)/g)) {
    const names = [...m[1].matchAll(/"([^"]+)"/g)].map((n) => `\`${n[1]}\``);
    parts.push(names.join(" or "));
  }
  if (/\brequireInstanceAdmin\b/.test(chain)) parts.push("instance admin");
  return parts.join(" + ");
}

function describeInput(body) {
  const inputs = [];
  const bodySchema = body.match(/parseBody\(c, (\w+)/);
  if (bodySchema) inputs.push(`body \`${bodySchema[1]}\``);
  const queryKeys = [...body.matchAll(/c\.req\.query\("(\w+)"\)/g)].map((m) => m[1]);
  const querySchema =
    body.match(/parseQuery\(c, (\w+)/) ?? body.match(/parseWith\((\w+), (?:c\.req\.query|\{)/);
  if (querySchema) {
    const keys = queryKeys.length ? ` (${queryKeys.map((k) => `\`${k}\``).join(", ")})` : "";
    inputs.push(`query \`${querySchema[1]}\`${keys}`);
  } else {
    for (const key of queryKeys) inputs.push(`query \`${key}\``);
  }
  const profile = body.match(/parseWith\((\w+), parseUserProfileImport/);
  if (profile) inputs.push(`body profile export → \`${profile[1]}\``);
  if (/c\.req\.parseBody\(\)/.test(body)) {
    const field = body.match(/body\.(\w+);?\n/);
    inputs.push(`multipart field \`${field?.[1] ?? "file"}\``);
  }
  if (/c\.req\.arrayBuffer\(\)/.test(body)) inputs.push("raw bytes");
  return [...new Set(inputs)].join(", ");
}

export function collectRoutes(root) {
  const dir = path.join(root, "apps/server/src/routes");
  const sections = [];
  for (const [file, title] of SECTIONS) {
    const source = fs.readFileSync(path.join(dir, `${file}.ts`), "utf8").replace(/\r\n/g, "\n");
    const summary = source.match(/\/\*\* (.+?) \*\/\nconst routes = new Hono/)?.[1] ?? "";
    const routes = [];
    // Each top-level routes.<method>( call starts a chunk that runs to the next one.
    const chunks = source.split(/^(?=routes\.(?:get|post|put|patch|delete)\()/m).slice(1);
    for (const chunk of chunks) {
      const m = chunk.match(HEAD_RE);
      if (!m) continue;
      const [head, method, routePath, chain] = m;
      const body = chunk.slice(head.length);
      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        auth: describeAuth(chain, body),
        write: /\brequireWrite\b/.test(chain),
        team: describeTeam(chain),
        permission: describePermissions(chain),
        input: describeInput(body),
      });
    }
    sections.push({ file, title, summary, routes });
  }
  return sections;
}

export function renderRoutes(sections) {
  const total = sections.reduce((sum, s) => sum + s.routes.length, 0);
  const lines = [
    BEGIN,
    "",
    `## Routes (${total})`,
    "",
    "Generated from `apps/server/src/routes/*.ts` by `pnpm docs:api`; do not edit by hand.",
    "",
    "- **Auth**: `bearer` = session JWT or PAT required; `optional` = works signed out too; `none` = public; `bot key` = `X-Teamflow-Bot-Key` header; `stream token` = `?token=` from `POST /attachments/:id/stream-token`.",
    "- **Write**: needs a token with the `write` scope.",
    "- **Team**: caller must be a member of the owning team (resolved from the path, or from the row/issue/column/upload/attachment named in it); a team-scoped PAT must match it.",
    "- **Input**: schema names are exports of `@teamflow/core`. Path ids are UUIDs (`idParamSchema`).",
    "",
  ];
  for (const section of sections) {
    lines.push(`### ${section.title}`, "");
    if (section.summary) lines.push(section.summary, "");
    lines.push("| Method | Path | Auth | Write | Team | Permission | Input |");
    lines.push("|--------|------|------|-------|------|------------|-------|");
    for (const r of section.routes) {
      lines.push(
        `| ${r.method} | \`${r.path}\` | ${r.auth} | ${r.write ? "yes" : ""} | ${r.team} | ${r.permission} | ${r.input} |`,
      );
    }
    lines.push("");
  }
  lines.push(END);
  return lines.join("\n");
}

export function generateApiDocs(root) {
  const apiPath = path.join(root, "docs/API.md");
  const current = fs.readFileSync(apiPath, "utf8").replace(/\r\n/g, "\n");
  const generated = renderRoutes(collectRoutes(root));
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error(`docs/API.md is missing the ${BEGIN} / ${END} markers`);
  }
  const next = current.slice(0, start) + generated + current.slice(end + END.length);
  return { apiPath, current, next };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { apiPath, current, next } = generateApiDocs(root);
  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error("docs/API.md is out of date. Run: pnpm docs:api");
      process.exit(1);
    }
    console.log("docs/API.md is up to date.");
  } else {
    fs.writeFileSync(apiPath, next);
    console.log("Wrote docs/API.md");
  }
}
