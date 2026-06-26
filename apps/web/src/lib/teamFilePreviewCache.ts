import { client } from "../api";

const THUMB_MAX_PX = 128;
const cache = new Map<string, string>();

async function createThumbnailBlob(blob: Blob, maxSize = THUMB_MAX_PX) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not create preview canvas");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Could not encode preview"))),
      "image/jpeg",
      0.82,
    );
  });
}

export type TeamFilePreviewCache = {
  getThumbnail: (fileId: string, linkId: string) => Promise<string>;
  getFull: (fileId: string, linkId: string) => Promise<string>;
  revokeAll: () => void;
};

export function createTeamFilePreviewCache(): TeamFilePreviewCache {
  const inflight = new Map<string, Promise<string>>();

  async function load(fileId: string, linkId: string, thumbnail: boolean) {
    const cacheKey = thumbnail ? `${fileId}:thumb` : `${fileId}:full`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const pending = inflight.get(cacheKey);
    if (pending) return pending;

    const promise = (async () => {
      const blob = await client.downloadAttachment(linkId);
      const previewBlob = thumbnail ? await createThumbnailBlob(blob) : blob;
      const url = URL.createObjectURL(previewBlob);
      cache.set(cacheKey, url);
      inflight.delete(cacheKey);
      return url;
    })().catch((err) => {
      inflight.delete(cacheKey);
      throw err;
    });

    inflight.set(cacheKey, promise);
    return promise;
  }

  return {
    getThumbnail(fileId, linkId) {
      return load(fileId, linkId, true);
    },
    getFull(fileId, linkId) {
      return load(fileId, linkId, false);
    },
    revokeAll() {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
      inflight.clear();
    },
  };
}

/** Shared cache that survives drawer open/close within the same page session. */
let sharedPreviewCache: TeamFilePreviewCache | null = null;

export function getSharedTeamFilePreviewCache() {
  if (!sharedPreviewCache) {
    sharedPreviewCache = createTeamFilePreviewCache();
  }
  return sharedPreviewCache;
}
