import { useEffect, useMemo, useState } from "react";
import type { BoardRowPublic, IssueAttachmentPublic } from "@teamflow/core";
import { client } from "../api";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type LinkRowFilePanelProps = {
  issueId: string;
  row: BoardRowPublic | null;
  linkedFileIds: ReadonlySet<string>;
  onLinked: (attachment: IssueAttachmentPublic) => void;
};

export function LinkRowFilePanel({
  issueId,
  row,
  linkedFileIds,
  onLinked,
}: LinkRowFilePanelProps) {
  const [rowFiles, setRowFiles] = useState<IssueAttachmentPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingFileId, setLinkingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) {
      setRowFiles([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void client
      .listRowAttachments(row.id)
      .then(({ attachments }) => {
        if (!cancelled) setRowFiles(attachments);
      })
      .catch((err) => {
        if (!cancelled) {
          setRowFiles([]);
          setError(err instanceof Error ? err.message : "Could not load row files");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [row?.id]);

  const linkableFiles = useMemo(
    () => rowFiles.filter((file) => !linkedFileIds.has(file.fileId)),
    [rowFiles, linkedFileIds],
  );

  async function linkFile(file: IssueAttachmentPublic) {
    if (linkingFileId) return;
    setLinkingFileId(file.fileId);
    setError(null);
    try {
      const { attachment } = await client.linkIssueAttachment(issueId, file.fileId);
      onLinked(attachment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link file");
    } finally {
      setLinkingFileId(null);
    }
  }

  if (!row) {
    return (
      <p className="muted issue-link-row-files-empty">
        Put this issue on a row to link files from that row&apos;s shared folder.
      </p>
    );
  }

  return (
    <div className="issue-link-row-files">
      <p className="issue-link-row-files-head">
        Link from <strong>{row.name}</strong> shared files
      </p>
      {loading ? (
        <p className="muted">Loading row files…</p>
      ) : rowFiles.length === 0 ? (
        <p className="muted">No shared files on this row yet. Use the row Files button to upload.</p>
      ) : linkableFiles.length === 0 ? (
        <p className="muted">All row shared files are already linked on this issue.</p>
      ) : (
        <ul className="issue-link-row-files-list">
          {linkableFiles.map((file) => (
            <li key={file.fileId} className="issue-link-row-files-item">
              <div className="issue-link-row-files-meta">
                <span className="issue-link-row-files-name">{file.filename}</span>
                <span className="muted">{formatFileSize(file.sizeBytes)}</span>
              </div>
              <button
                type="button"
                className="secondary compact"
                disabled={linkingFileId === file.fileId}
                onClick={() => void linkFile(file)}
              >
                {linkingFileId === file.fileId ? "Linking…" : "Link"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="issue-link-row-files-error">{error}</p> : null}
    </div>
  );
}
