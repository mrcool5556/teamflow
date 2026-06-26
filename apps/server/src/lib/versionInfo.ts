import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { MaintenanceVersionPublic } from "@teamflow/core";
import { findRepoRoot } from "@teamflow/db";

const execFileAsync = promisify(execFile);

function getAppDir() {
  const configured = process.env.TEAMFLOW_APP_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(findRepoRoot(), configured);
  }
  return findRepoRoot();
}

async function runGit(appDir: string, args: string[], timeoutMs = 12_000) {
  const { stdout } = await execFileAsync("git", ["-C", appDir, ...args], {
    timeout: timeoutMs,
    maxBuffer: 512 * 1024,
  });
  return stdout.trim();
}

function readPackageVersion(appDir: string) {
  try {
    const raw = readFileSync(`${appDir}/package.json`, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function shortSha(full: string | null) {
  if (!full) return null;
  return full.slice(0, 7);
}

export async function getMaintenanceVersionInfo(): Promise<MaintenanceVersionPublic> {
  const appDir = getAppDir();
  const version = readPackageVersion(appDir);

  if (!existsSync(`${appDir}/.git`)) {
    return {
      version,
      branch: null,
      commit: null,
      commitShort: null,
      commitDate: null,
      latestCommit: null,
      latestCommitShort: null,
      updateAvailable: false,
      commitsBehind: null,
      gitError: "Not a git checkout — version check unavailable.",
    };
  }

  try {
    const branch = await runGit(appDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const commit = await runGit(appDir, ["rev-parse", "HEAD"]);
    const commitDate = await runGit(appDir, ["log", "-1", "--format=%cI"]);

    let latestCommit: string | null = null;
    let commitsBehind: number | null = null;
    let gitError: string | null = null;

    try {
      const remoteUrl = await runGit(appDir, ["remote", "get-url", "origin"]);
      const { stdout: lsRemote } = await execFileAsync(
        "git",
        ["ls-remote", remoteUrl, `refs/heads/${branch}`],
        { timeout: 15_000, maxBuffer: 64 * 1024 },
      );
      latestCommit = lsRemote.split(/\s+/)[0]?.trim() || null;

      if (latestCommit && latestCommit !== commit) {
        const behind = await runGit(appDir, [
          "rev-list",
          "--count",
          `${commit}..${latestCommit}`,
        ]);
        commitsBehind = Number(behind);
        if (!Number.isFinite(commitsBehind)) commitsBehind = null;
      } else {
        commitsBehind = 0;
      }
    } catch (err) {
      gitError =
        err instanceof Error
          ? `Could not reach origin (${err.message})`
          : "Could not reach origin";
    }

    const updateAvailable = Boolean(
      latestCommit && commit && latestCommit !== commit && (commitsBehind ?? 0) > 0,
    );

    return {
      version,
      branch,
      commit,
      commitShort: shortSha(commit),
      commitDate: commitDate || null,
      latestCommit,
      latestCommitShort: shortSha(latestCommit),
      updateAvailable,
      commitsBehind: updateAvailable ? commitsBehind : commitsBehind ?? 0,
      gitError,
    };
  } catch (err) {
    return {
      version,
      branch: null,
      commit: null,
      commitShort: null,
      commitDate: null,
      latestCommit: null,
      latestCommitShort: null,
      updateAvailable: false,
      commitsBehind: null,
      gitError: err instanceof Error ? err.message : "Git version check failed",
    };
  }
}
