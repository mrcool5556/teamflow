import { useEffect, useMemo, useState } from "react";
import type { BoardRowPublic, IssueAttachmentPublic } from "@teamflow/core";
import { client } from "../api";
import { LinkFromFileRef } from "./LinkFromFileRef";
import { SharedFileBrowser } from "./SharedFileBrowser";

type LinkRowFilePanelProps = {
  teamId: string;
  issueId: string;
  row: BoardRowPublic | null;
  linkedFileIds: ReadonlySet<string>;
  onLinked: (attachment: IssueAttachmentPublic) => void;
};

export function LinkRowFilePanel({
  teamId,
  issueId,
  row,
  linkedFileIds,
  onLinked,
}: LinkRowFilePanelProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [rowFiles, setRowFiles] = useState<IssueAttachmentPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingFileId, setLinkingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) {
      setRowFiles([]);
      return;
    }

    let cancelled = false;
    void client
      .listRowAttachments(row.id)
      .then(({ attachments }) => {
        if (!cancelled) setRowFiles(attachments);
      })
      .catch(() => {
        if (!cancelled) setRowFiles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [row?.id]);

  useEffect(() => {
    if (!browserOpen || !row) return;

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
  }, [browserOpen, row?.id]);

  const linkableCount = useMemo(
    () => rowFiles.filter((file) => !linkedFileIds.has(file.fileId)).length,
    [rowFiles, linkedFileIds],
  );

  async function linkFileId(fileId: string) {
    setLinkingFileId(fileId);
    setError(null);
    try {
      const { attachment } = await client.linkIssueAttachment(issueId, fileId);
      onLinked(attachment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link file");
      throw err;
    } finally {
      setLinkingFileId(null);
    }
  }

  async function linkFile(file: IssueAttachmentPublic) {
    await linkFileId(file.fileId);
  }

  if (!row) {
    return (
      <p className="muted issue-link-row-files-empty">
        Put this issue on a row to browse that row&apos;s shared files, or paste a file ref below.
      </p>
    );
  }

  return (
    <div className="issue-link-row-files">
      <div className="issue-link-row-files-toolbar">
        <button type="button" className="secondary" onClick={() => setBrowserOpen(true)}>
          View row files
          {rowFiles.length > 0 ? ` (${linkableCount} linkable)` : ""}
        </button>
        <p className="muted issue-link-row-files-hint">
          Search and link from <strong>{row.name}</strong>, or paste a file ref from any row/issue.
        </p>
      </div>

      <LinkFromFileRef
        teamId={teamId}
        onLinkFileId={linkFileId}
        disabled={Boolean(linkingFileId)}
      />

      {error ? <p className="issue-link-row-files-error">{error}</p> : null}

      <SharedFileBrowser
        open={browserOpen}
        title={`${row.name} — shared files`}
        subtitle="Link to this issue or copy a file ref to share elsewhere."
        files={rowFiles}
        loading={loading}
        linkedFileIds={linkedFileIds}
        linkingFileId={linkingFileId}
        onClose={() => setBrowserOpen(false)}
        onLink={(file) => {
          void linkFile(file).then(() => setBrowserOpen(false));
        }}
      />
    </div>
  );
}
