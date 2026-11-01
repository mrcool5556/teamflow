import { client } from "../api";

/** Save a blob under `filename` through a temporary link. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Hand a URL to the browser's own download manager through a temporary link. */
export function startBrowserDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Save an attachment. Gets a short-lived download token, then lets the browser fetch the file
 * itself: its download manager shows progress at once and writes to disk, so large files never
 * sit in this tab's memory. Resolves once the browser has been handed the download.
 */
export async function downloadAttachmentFile(attachmentId: string, filename: string) {
  startBrowserDownload(await client.resolveDownloadUrl(attachmentId), filename);
}
