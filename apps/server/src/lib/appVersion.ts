import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** What a prebuilt release writes into its root as version.json (scripts/package-release.mjs). */
export type ReleaseInfo = {
  version: string;
  commit: string | null;
  builtAt: string | null;
  platform: string | null;
};

let cached: ReleaseInfo | null = null;

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The running version. A release has version.json at its root (three levels above
 * apps/server/dist/lib); a dev checkout falls back to the root package.json.
 */
export function getAppVersion(): ReleaseInfo {
  if (cached) return cached;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..", "..", "..", "..");
  const release = readJson(path.join(root, "version.json"));
  if (release && typeof release.version === "string") {
    cached = {
      version: release.version,
      commit: typeof release.commit === "string" ? release.commit : null,
      builtAt: typeof release.builtAt === "string" ? release.builtAt : null,
      platform: typeof release.platform === "string" ? release.platform : null,
    };
    return cached;
  }
  const pkg = readJson(path.join(root, "package.json"));
  cached = {
    version: typeof pkg?.version === "string" ? pkg.version : "0.0.0",
    commit: null,
    builtAt: null,
    platform: null,
  };
  return cached;
}

/** True when this process runs from an unpacked release rather than a git checkout. */
export function isReleaseInstall(): boolean {
  return getAppVersion().builtAt !== null;
}
