#!/usr/bin/env node
/**
 * Build a prebuilt Teamflow release for this OS and CPU.
 *
 *   node scripts/package-release.mjs [--version 0.2.0] [--skip-build] [--out out]
 *
 * Produces out/teamflow-v<version>-<platform>.tar.gz (Linux) or .zip (Windows) plus a
 * matching .sha256 file. Files sit at the archive root (no top folder):
 *
 *   version.json            { version, commit, builtAt, platform }
 *   apps/server/            dist/ + production node_modules (workspace packages inlined, no symlinks)
 *   apps/web/dist/          the built web app, served by the server
 *   deploy/                 install, update, backup and service scripts for this platform
 *
 * better-sqlite3 ships a native binary, so each platform must be packaged on that platform
 * (the release workflow runs this once per runner). Run from the repo root.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
if (!fs.existsSync(path.join(root, "pnpm-workspace.yaml"))) {
  console.error("Run from the repo root.");
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = (arg("version", rootPkg.version) ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  console.error(`Not a SemVer version: ${version}`);
  process.exit(1);
}
const isWindows = process.platform === "win32";
const platform = `${isWindows ? "win" : process.platform}-${process.arch}`;
const outDir = path.resolve(root, arg("out", "out"));
// pnpm deploy mis-joins absolute paths on another Windows drive, so stage inside the repo.
const stageRel = path.relative(root, path.join(outDir, "stage"));
const stage = path.join(root, stageRel);
const base = `teamflow-v${version}-${platform}`;

const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", cwd: root, shell: isWindows, ...opts });
}

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

/** Drop sources, tests, maps and type files from our own packages; they are not needed to run. */
function prunePackage(dir) {
  for (const name of ["src", "tests", "tsconfig.json", "drizzle.config.ts", "vitest.config.ts"]) {
    rm(path.join(dir, name));
  }
  const dist = path.join(dir, "dist");
  if (!fs.existsSync(dist)) return;
  for (const entry of fs.readdirSync(dist, { recursive: true })) {
    const file = path.join(dist, entry);
    if (/\.(js\.map|d\.ts|d\.ts\.map)$/.test(entry)) rm(file);
  }
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
  } catch {
    return null;
  }
}

// 1. Build everything (core, db, api-client, server, web).
if (!flag("skip-build")) run(pnpm, ["-r", "build"]);
for (const needed of [
  "apps/server/dist/index.js",
  "apps/server/dist/migrate.js",
  "apps/web/dist/index.html",
]) {
  if (!fs.existsSync(path.join(root, needed))) {
    console.error(`Missing ${needed}. Build first.`);
    process.exit(1);
  }
}

// 2. Production dependencies at the exact lockfile versions, flat (hoisted) so the archive has
//    no symlinks. pnpm 9's `deploy` ignores the lockfile, so instead: a frozen install over just
//    the server, core and db manifests, then prune what those three cannot reach.
const SERVER_PACKAGES = ["apps/server", "packages/core", "packages/db"];
rm(stage);
fs.mkdirSync(stage, { recursive: true });
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
}
for (const pkg of SERVER_PACKAGES) {
  fs.mkdirSync(path.join(stage, pkg), { recursive: true });
  fs.copyFileSync(path.join(root, pkg, "package.json"), path.join(stage, pkg, "package.json"));
}
run(pnpm, ["install", "--prod", "--frozen-lockfile", "--config.node-linker=hoisted"], {
  cwd: stage,
});

/** Node's lookup: <dir>/node_modules/<name>, then each parent up to the stage root. */
function resolvePackage(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.relative(stage, dir) === "") return null;
    dir = path.dirname(dir);
  }
}

// Walk dependencies from the three manifests. Workspace packages are followed by name so their
// third-party dependencies are kept too.
const keep = new Set();
const queue = SERVER_PACKAGES.map((pkg) => path.join(stage, pkg));
while (queue.length) {
  const dir = queue.pop();
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const names = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
  for (const name of Object.keys(names)) {
    if (name.startsWith("@teamflow/")) continue; // copied in below
    const found = resolvePackage(name, dir);
    if (!found) {
      if (manifest.dependencies?.[name]) {
        console.error(`Cannot resolve ${name} (needed by ${manifest.name})`);
        process.exit(1);
      }
      continue; // optional or peer that is not installed
    }
    const real = fs.realpathSync(found);
    if (keep.has(real)) continue;
    keep.add(real);
    queue.push(real);
  }
}

/** Delete every installed package that the walk did not reach, at any depth. */
function prune(nodeModules) {
  if (!fs.existsSync(nodeModules)) return;
  for (const entry of fs.readdirSync(nodeModules)) {
    if (entry === ".bin" || entry.startsWith(".")) {
      rm(path.join(nodeModules, entry));
      continue;
    }
    const entries = entry.startsWith("@")
      ? fs.readdirSync(path.join(nodeModules, entry)).map((child) => path.join(entry, child))
      : [entry];
    for (const name of entries) {
      const dir = path.join(nodeModules, name);
      if (name.startsWith("@teamflow")) {
        rm(dir);
      } else if (!keep.has(fs.realpathSync(dir))) {
        rm(dir);
      } else {
        prune(path.join(dir, "node_modules"));
      }
    }
    if (entry.startsWith("@") && fs.readdirSync(path.join(nodeModules, entry)).length === 0) {
      rm(path.join(nodeModules, entry));
    }
  }
}
prune(path.join(stage, "node_modules"));

// Workspace packages become real folders at the top level, so apps/server/dist and
// @teamflow/db/dist both find them by walking up to <release>/node_modules.
for (const pkg of ["apps/server", "packages/core", "packages/db"]) {
  prune(path.join(stage, pkg, "node_modules"));
}
for (const pkg of ["core", "db"]) {
  const to = path.join(stage, "node_modules", "@teamflow", pkg);
  fs.mkdirSync(to, { recursive: true });
  // Versions that clash with the top level are nested under the package; keep them with it.
  const nested = path.join(stage, "packages", pkg, "node_modules");
  if (fs.existsSync(nested) && fs.readdirSync(nested).length)
    copyDir(nested, path.join(to, "node_modules"));
  fs.copyFileSync(path.join(root, "packages", pkg, "package.json"), path.join(to, "package.json"));
  copyDir(path.join(root, "packages", pkg, "dist"), path.join(to, "dist"));
  prunePackage(to);
}
if (!fs.existsSync(path.join(stage, "node_modules", "@teamflow", "db", "dist", "init.sql"))) {
  console.error("init.sql missing from @teamflow/db/dist. The db build should copy it.");
  process.exit(1);
}
const serverDir = path.join(stage, "apps", "server");
const serverModules = path.join(serverDir, "node_modules");
if (fs.existsSync(serverModules) && fs.readdirSync(serverModules).length === 0) rm(serverModules);
copyDir(path.join(root, "apps", "server", "dist"), path.join(serverDir, "dist"));
prunePackage(serverDir);
rm(path.join(stage, "packages"));
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])
  rm(path.join(stage, file));

// 3. Web app.
copyDir(path.join(root, "apps", "web", "dist"), path.join(stage, "apps", "web", "dist"));

// 4. Deploy scripts for this platform.
const deployFrom = isWindows ? ["windows"] : ["proxmox-lxc"];
for (const dir of deployFrom)
  copyDir(path.join(root, "deploy", dir), path.join(stage, "deploy", dir));
for (const file of ["LICENSE", "README.md"]) {
  if (fs.existsSync(path.join(root, file)))
    fs.copyFileSync(path.join(root, file), path.join(stage, file));
}

// 5. version.json: the server reads it for /health and the Updates page.
const info = { version, commit: gitCommit(), builtAt: new Date().toISOString(), platform };
fs.writeFileSync(path.join(stage, "version.json"), `${JSON.stringify(info, null, 2)}\n`);

// 6. Archive. bsdtar (Windows 10+ tar.exe) writes zip with -a; GNU tar writes the tarball.
const archive = path.join(outDir, `${base}${isWindows ? ".zip" : ".tar.gz"}`);
rm(archive);
if (isWindows) {
  // The Windows tar (bsdtar), not Git Bash's GNU tar, which cannot write zip.
  const tarExe = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tarExe, ["-a", "-c", "-f", archive, "-C", stage, "."], { stdio: "inherit" });
} else {
  execFileSync("tar", ["-czf", archive, "--owner=0", "--group=0", "-C", stage, "."], {
    stdio: "inherit",
  });
}
const sha = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
fs.writeFileSync(`${archive}.sha256`, `${sha}  ${path.basename(archive)}\n`);

const mb = (fs.statSync(archive).size / 1024 / 1024).toFixed(1);
console.log(`\nRelease: ${archive} (${mb} MB)\nsha256:  ${sha}\nStaged:  ${stage}`);
