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

/** Fetch an attachment's bytes (with the session token) and save them. */
export async function downloadAttachmentFile(attachmentId: string, filename: string) {
  downloadBlob(await client.downloadAttachment(attachmentId), filename);
}
