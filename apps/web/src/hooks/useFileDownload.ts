import { useState } from "react";
import { downloadAttachmentFile } from "../lib/download";
import { errorMessage } from "../lib/errorSink";
import { useToasts } from "../ui/toastContext";

/** How long the button keeps saying "Starting…" after the browser has been handed the file. */
export const DOWNLOAD_HANDOFF_MS = 1200;

/**
 * Start attachment downloads with feedback: the caller shows "Starting…" while `startingId`
 * matches, a toast says where progress is, and failures get a toast with Retry.
 */
export function useFileDownload() {
  const { push } = useToasts();
  const [startingId, setStartingId] = useState<string | null>(null);

  async function start(attachmentId: string, filename: string) {
    setStartingId(attachmentId);
    try {
      await downloadAttachmentFile(attachmentId, filename);
      push({
        message: `Downloading ${filename} — progress is in your browser's downloads`,
      });
      setTimeout(
        () => setStartingId((current) => (current === attachmentId ? null : current)),
        DOWNLOAD_HANDOFF_MS,
      );
    } catch (err) {
      setStartingId(null);
      push({
        tone: "error",
        message: `Could not download ${filename}: ${errorMessage(err, "download failed")}`,
        action: { label: "Retry", onClick: () => void start(attachmentId, filename) },
      });
    }
  }

  return { start, startingId };
}
