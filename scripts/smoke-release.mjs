#!/usr/bin/env node
/**
 * Start an unpacked release on a throwaway database and check that it answers.
 *
 *   node scripts/smoke-release.mjs <unpacked-release-dir> [--expect-version 0.2.0]
 *
 * Runs migrate.js and db-maintenance.js, then the server on a free port from an empty working folder (like
 * /opt/teamflow), checks /health reports the version and / serves the web app, and stops it.
 * Exits non-zero on any failure. Used by the release workflow and by hand.
 */
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(dir, "apps", "server", "dist", "index.js"))) {
  console.error(`Not an unpacked release: ${dir}`);
  process.exit(1);
}
const i = process.argv.indexOf("--expect-version");
const info = JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"));
const expected = i > -1 ? process.argv[i + 1] : info.version;

const port = await new Promise((resolve) => {
  const srv = net.createServer().listen(0, "127.0.0.1", () => {
    const { port: p } = srv.address();
    srv.close(() => resolve(p));
  });
});

const work = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-smoke-"));
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  HOST: "127.0.0.1",
  SERVE_WEB: "true",
  DATABASE_URL: `file:${path.join(work, "data", "teamflow.db")}`,
  JWT_SECRET: crypto.randomBytes(32).toString("hex"),
  TEAMFLOW_SECRETS_KEY: crypto.randomBytes(32).toString("hex"),
  PUBLIC_URL: `http://127.0.0.1:${port}`,
};
delete env.VITEST;

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
}

execFileSync(process.execPath, [path.join(dir, "apps", "server", "dist", "migrate.js")], {
  cwd: work,
  env,
  stdio: "inherit",
});
execFileSync(process.execPath, [path.join(dir, "apps", "server", "dist", "db-maintenance.js")], {
  cwd: work,
  env,
  stdio: "inherit",
});

const server = spawn(process.execPath, [path.join(dir, "apps", "server", "dist", "index.js")], {
  cwd: work,
  env,
  stdio: "inherit",
});

try {
  let health = null;
  for (let attempt = 0; attempt < 40 && !health; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) health = await res.json();
    } catch {
      /* not up yet */
    }
  }
  if (!health) fail("no /health answer in 20 s");
  else if (health.version !== expected)
    fail(`/health version ${health.version}, expected ${expected}`);
  else {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    if (!page.ok || !html.includes('<div id="root"'))
      fail(`/ did not serve the web app (${page.status})`);
    else console.log(`SMOKE OK: v${health.version} on port ${port}, web app served`);
  }
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
}
