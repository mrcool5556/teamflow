import fs from "node:fs/promises";
import path from "node:path";

export type DiskSpace = { totalBytes: number; freeBytes: number };

/**
 * Free and total bytes on the filesystem holding `dir`, as the server process sees them
 * (statfs; space reserved for root is not counted as free). null when the platform or path
 * cannot answer. Tests replace `diskProbe.read` to simulate a full disk.
 */
export const diskProbe = {
  async read(dir: string): Promise<DiskSpace | null> {
    try {
      const stats = await fs.statfs(dir);
      return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
    } catch {
      return null;
    }
  },
};

/** Walk up from `dir` to the nearest existing folder (the upload dir may not exist yet). */
export async function readDiskSpace(dir: string): Promise<DiskSpace | null> {
  let current = dir;
  for (;;) {
    const result = await diskProbe.read(current);
    if (result) return result;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
