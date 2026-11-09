import fs from "node:fs/promises";
import path from "node:path";
import type {
  MaintenanceChannel,
  MaintenanceReleaseCheckPublic,
  MaintenanceReleasePublic,
} from "@teamflow/core";
import { compareVersions, SEMVER_PATTERN } from "@teamflow/core";
import { config } from "../config.js";
import { getAppVersion, isReleaseInstall } from "./appVersion.js";

/**
 * "Is there a newer Teamflow?" Asks the GitHub Releases API (no token: 60 requests an hour per
 * IP, so results are cached for six hours in memory and in data/update-check.json). The channel
 * (stable or pre-release) is kept in data/update-settings.json.
 */

const CACHE_MS = 6 * 60 * 60 * 1000;
const CHECK_FILE = "update-check.json";
const SETTINGS_FILE = "update-settings.json";

type CachedCheck = {
  checkedAt: string | null;
  checkError: string | null;
  channel: MaintenanceChannel;
  latest: MaintenanceReleasePublic | null;
};

let cache: CachedCheck | null = null;
let inFlight: Promise<CachedCheck> | null = null;

function dataDir() {
  return path.join(config.appDir, "data");
}

/** The platform suffix in release asset names (teamflow-vX.Y.Z-<platform>.tar.gz / .zip). */
export function releasePlatform() {
  return `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
}

export async function readChannel(): Promise<MaintenanceChannel> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dataDir(), SETTINGS_FILE), "utf8"));
    return raw?.channel === "prerelease" ? "prerelease" : "stable";
  } catch {
    return "stable";
  }
}

export async function writeChannel(channel: MaintenanceChannel) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(
    path.join(dataDir(), SETTINGS_FILE),
    `${JSON.stringify({ channel }, null, 2)}\n`,
    "utf8",
  );
  cache = null; // the newest release depends on the channel
}

type GithubAsset = { name?: string; size?: number };
type GithubRelease = {
  tag_name?: string;
  body?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
};

/** Pick the newest usable release for the channel from a GitHub releases list. */
export function pickLatestRelease(
  releases: GithubRelease[],
  channel: MaintenanceChannel,
  platform = releasePlatform(),
): MaintenanceReleasePublic | null {
  let best: MaintenanceReleasePublic | null = null;
  for (const r of releases) {
    if (r.draft || !r.tag_name) continue;
    if (r.prerelease && channel !== "prerelease") continue;
    const version = r.tag_name.replace(/^v/, "");
    if (!SEMVER_PATTERN.test(version)) continue;
    const asset = (r.assets ?? []).find(
      (a) => typeof a.name === "string" && a.name.startsWith(`teamflow-v${version}-${platform}.`),
    );
    const release: MaintenanceReleasePublic = {
      version,
      notes: (r.body ?? "").trim(),
      publishedAt: r.published_at ?? null,
      url: r.html_url ?? `https://github.com/${config.releases.repo}/releases/tag/${r.tag_name}`,
      prerelease: Boolean(r.prerelease),
      sizeBytes: typeof asset?.size === "number" ? asset.size : null,
    };
    if (!best || compareVersions(release.version, best.version) > 0) best = release;
  }
  return best;
}

async function readDiskCache(): Promise<CachedCheck | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), CHECK_FILE), "utf8")) as CachedCheck;
  } catch {
    return null;
  }
}

async function writeDiskCache(value: CachedCheck) {
  try {
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(path.join(dataDir(), CHECK_FILE), JSON.stringify(value, null, 2), "utf8");
  } catch {
    // A read-only data folder only costs the cache.
  }
}

async function fetchLatest(channel: MaintenanceChannel): Promise<CachedCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(
      `${config.releases.apiBase}/repos/${config.releases.repo}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Teamflow/${getAppVersion().version}`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const limited = res.status === 403 || res.status === 429;
      throw new Error(
        limited
          ? "GitHub's rate limit was reached; try again in an hour."
          : `GitHub answered ${res.status}.`,
      );
    }
    const list = (await res.json()) as GithubRelease[];
    return { checkedAt, checkError: null, channel, latest: pickLatestRelease(list, channel) };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Couldn't reach GitHub (timed out)."
        : err instanceof Error && err.message.startsWith("GitHub")
          ? err.message
          : "Couldn't reach GitHub to check for updates.";
    // Keep the last good answer, but say the check failed.
    const previous = cache ?? (await readDiskCache());
    return {
      checkedAt,
      checkError: message,
      channel,
      latest: previous?.channel === channel ? previous.latest : null,
    };
  }
}

/**
 * The cached check, refreshed when older than six hours or when `force` is set ("Check now").
 * Never throws; failures land in checkError.
 */
export async function getReleaseCheck(options?: {
  force?: boolean;
  network?: boolean;
}): Promise<MaintenanceReleaseCheckPublic> {
  const channel = await readChannel();
  const current = { ...getAppVersion(), releaseInstall: isReleaseInstall() };
  const enabled = config.releases.checkEnabled;

  if (!cache) cache = await readDiskCache();
  if (cache && cache.channel !== channel) cache = null;

  const stale =
    !cache?.checkedAt || Date.now() - Date.parse(cache.checkedAt) > CACHE_MS || options?.force;
  if (enabled && stale && options?.network !== false) {
    inFlight ??= fetchLatest(channel).finally(() => {
      inFlight = null;
    });
    cache = await inFlight;
    await writeDiskCache(cache);
  }

  return {
    current,
    latest: enabled ? (cache?.latest ?? null) : null,
    channel,
    checkedAt: enabled ? (cache?.checkedAt ?? null) : null,
    checkError: enabled ? (cache?.checkError ?? null) : null,
    checkEnabled: enabled,
  };
}

/** True when `latest` is newer than the running version. */
export function isUpdateAvailable(check: MaintenanceReleaseCheckPublic) {
  return Boolean(check.latest && compareVersions(check.latest.version, check.current.version) > 0);
}

/** Test hook. */
export function resetReleaseCheck() {
  cache = null;
  inFlight = null;
}
