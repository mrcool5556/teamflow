import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
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

function formatGitError(err: unknown) {
  if (!(err instanceof Error)) return "Could not check origin";

  const msg = err.message
    .replace(/^Command failed:[^\n]*\n?/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!msg) return "Could not check origin";
  if (/invalid revision range/i.test(msg)) {
    return "Could not compare with origin — local history may have diverged.";
  }
  if (/could not read from remote|unable to access|network is unreachable/i.test(msg)) {
    return "Could not reach origin — check server network access to GitHub.";
  }
  if (/authentication failed|403|401/i.test(msg)) {
    return "Could not authenticate with origin.";
  }

  const firstLine = msg.split("\n")[0]?.trim() ?? msg;
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}

async function gitCommitExists(appDir: string, rev: string) {
  try {
    await runGit(appDir, ["cat-file", "-e", `${rev}^{commit}`], 5_000);
    return true;
  } catch {
    return false;
  }
}

async function fetchOriginBranch(appDir: string, branch: string) {
  try {
    await runGit(
      appDir,
      ["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`, "--quiet", "--prune"],
      30_000,
    );
    return true;
  } catch {
    try {
      await runGit(appDir, ["fetch", "origin", branch, "--quiet"], 30_000);
      return true;
    } catch {
      return false;
    }
  }
}

async function resolveOriginCommit(
  appDir: string,
  branch: string,
  lsRemoteCommit: string,
): Promise<string | null> {
  if (await gitCommitExists(appDir, lsRemoteCommit)) {
    return lsRemoteCommit;
  }

  await fetchOriginBranch(appDir, branch);

  if (await gitCommitExists(appDir, lsRemoteCommit)) {
    return lsRemoteCommit;
  }

  try {
    return await runGit(appDir, ["rev-parse", `origin/${branch}`]);
  } catch {
    return lsRemoteCommit;
  }
}

async function compareWithOrigin(
  appDir: string,
  localCommit: string,
  originCommit: string,
): Promise<{ updateAvailable: boolean; commitsBehind: number | null }> {
  if (localCommit === originCommit) {
    return { updateAvailable: false, commitsBehind: 0 };
  }

  const localExists = await gitCommitExists(appDir, localCommit);
  const originExists = await gitCommitExists(appDir, originCommit);
  if (!localExists || !originExists) {
    return { updateAvailable: localCommit !== originCommit, commitsBehind: null };
  }

  try {
    await runGit(appDir, ["merge-base", "--is-ancestor", localCommit, originCommit]);
    try {
      const count = await runGit(appDir, [
        "rev-list",
        "--count",
        `${localCommit}..${originCommit}`,
      ]);
      const parsed = Number(count);
      return {
        updateAvailable: true,
        commitsBehind: Number.isFinite(parsed) ? parsed : null,
      };
    } catch {
      return { updateAvailable: true, commitsBehind: null };
    }
  } catch {
    // Not strictly behind — check if local is ahead of origin instead.
  }

  try {
    await runGit(appDir, ["merge-base", "--is-ancestor", originCommit, localCommit]);
    return { updateAvailable: false, commitsBehind: 0 };
  } catch {
    return { updateAvailable: true, commitsBehind: null };
  }
}

export async function getMaintenanceVersionInfo(options?: {
  skipOriginCheck?: boolean;
}): Promise<MaintenanceVersionPublic> {
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

    if (options?.skipOriginCheck) {
      return {
        version,
        branch,
        commit,
        commitShort: shortSha(commit),
        commitDate: commitDate || null,
        latestCommit: null,
        latestCommitShort: null,
        updateAvailable: false,
        commitsBehind: null,
        gitError: null,
      };
    }

    try {
      const remoteUrl = await runGit(appDir, ["remote", "get-url", "origin"]);
      const { stdout: lsRemote } = await execFileAsync(
        "git",
        ["ls-remote", remoteUrl, `refs/heads/${branch}`],
        { timeout: 15_000, maxBuffer: 64 * 1024 },
      );
      const lsRemoteCommit = lsRemote.split(/\s+/)[0]?.trim() || null;

      if (!lsRemoteCommit) {
        gitError = `Origin has no branch named ${branch}.`;
      } else {
        latestCommit = await resolveOriginCommit(appDir, branch, lsRemoteCommit);
        const resolvedOrigin = latestCommit ?? lsRemoteCommit;
        const comparison = await compareWithOrigin(appDir, commit, resolvedOrigin);
        commitsBehind = comparison.commitsBehind;

        return {
          version,
          branch,
          commit,
          commitShort: shortSha(commit),
          commitDate: commitDate || null,
          latestCommit: resolvedOrigin,
          latestCommitShort: shortSha(resolvedOrigin),
          updateAvailable: comparison.updateAvailable,
          commitsBehind: comparison.updateAvailable ? commitsBehind : commitsBehind ?? 0,
          gitError: null,
        };
      }
    } catch (err) {
      gitError = formatGitError(err);
    }

    const updateAvailable = Boolean(latestCommit && commit && latestCommit !== commit);

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
      gitError: formatGitError(err),
    };
  }
}
