import { useMemo, useState } from "react";
import type { BoardRowPublic } from "@teamflow/core";
import { client } from "../api";
import { useAttachmentList } from "../hooks/useAttachmentList";
import { describeAttachmentLimits, formatFileSize, formatTimestamp } from "../lib/format";
import { Drawer } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";
import { AttachmentImageThumbnail, isImageAttachment } from "./AttachmentImagePreview";
import { AttachmentLightboxes } from "./AttachmentLightboxes";
import { AttachmentVideoThumbnail, isVideoAttachment } from "./AttachmentVideoPlayer";
import { FileRefCopyButton } from "./FileRefCopyButton";
import { LinkFromFileRef } from "./LinkFromFileRef";
import { RefCopyButton } from "./RefCopyButton";

type RowFilesDrawerProps = {
  row: BoardRowPublic;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

export function RowFilesDrawer({ row, onClose, onNavigateRef }: RowFilesDrawerProps) {
  const { bindFileInput, ...files } = useAttachmentList(
    { kind: "row", id: row.id },
    { sizeDigits: 2 },
  );
  const { attachments } = files;
  const [fileSearch, setFileSearch] = useState("");

  function handleClose() {
    files.release();
    onClose();
  }

  const filteredAttachments = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return attachments;
    return attachments.filter((attachment) => {
      const hay =
        `${attachment.filename} ${attachment.fileRef} ${attachment.uploaderName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [attachments, fileSearch]);

  return (
    <Drawer onClose={handleClose} className="row-files-drawer">
      <header className="row-files-drawer-header">
        <div className="row-files-drawer-header-ids">
          <div className="row-files-drawer-id-row">
            <p className="eyebrow row-files-drawer-id">{row.key}</p>
            <RefCopyButton
              value={row.key}
              display="icon"
              share
              title={`Row ${row.name}`}
              onGo={onNavigateRef ? () => onNavigateRef(row.key) : undefined}
            />
          </div>
          <DialogTitle className="row-files-drawer-title">{row.name} — shared files</DialogTitle>
        </div>
        <button type="button" className="ghost" onClick={handleClose}>
          Close
        </button>
      </header>

      <div className="row-files-drawer-surface">
        <section className="row-files-drawer-section">
          <p className="muted row-files-drawer-intro">
            Tools, docs, and assets for everyone working in this row.
          </p>

          {attachments.length > 0 ? (
            <div className="row-files-search">
              <input
                type="search"
                value={fileSearch}
                placeholder="Search row files…"
                onChange={(e) => setFileSearch(e.target.value)}
              />
            </div>
          ) : null}

          {files.loading ? (
            <p className="muted">Loading files…</p>
          ) : attachments.length === 0 ? (
            <p className="muted">No files yet.</p>
          ) : filteredAttachments.length === 0 ? (
            <p className="muted">No files match your search.</p>
          ) : (
            <ul className="issue-attachment-list">
              {filteredAttachments.map((attachment) => (
                <li key={attachment.id} className="issue-attachment">
                  {isVideoAttachment(attachment) ? (
                    <AttachmentVideoThumbnail
                      attachment={attachment}
                      onOpen={() => files.openVideo(attachment)}
                    />
                  ) : isImageAttachment(attachment) ? (
                    <AttachmentImageThumbnail
                      attachment={attachment}
                      blobCache={files.blobCache}
                      onOpen={(imageUrl) => files.openImageUrl(attachment, imageUrl)}
                    />
                  ) : null}
                  <div className="issue-attachment-main">
                    <button
                      type="button"
                      className="ghost issue-attachment-name"
                      onClick={() => files.open(attachment)}
                    >
                      {attachment.filename}
                    </button>
                    <span className="issue-attachment-meta muted">
                      {attachment.fileRef} · {formatFileSize(attachment.sizeBytes, 2)} ·{" "}
                      {attachment.uploaderName} · {formatTimestamp(attachment.createdAt)}
                    </span>
                  </div>
                  <div className="issue-attachment-actions">
                    <FileRefCopyButton
                      fileRef={attachment.fileRef}
                      filename={attachment.filename}
                    />
                    <button
                      type="button"
                      className="ghost issue-attachment-delete"
                      disabled={files.deletingId === attachment.id}
                      onClick={() => void files.remove(attachment)}
                      aria-label={`Remove ${attachment.filename}`}
                      title="Remove file"
                    >
                      {files.deletingId === attachment.id ? "…" : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <LinkFromFileRef
            teamId={row.teamId}
            label="Link file from ref (another row or issue)"
            onLinkFileId={async (fileId) => {
              if (files.linkedFileIds.has(fileId)) return;
              const { attachment } = await client.linkRowAttachment(row.id, fileId);
              files.addLinked(attachment);
            }}
          />

          <div
            className={`issue-attachment-drop${files.dragOver ? " issue-attachment-drop--active" : ""}`}
            {...files.dropZoneProps}
          >
            <input ref={bindFileInput} type="file" hidden onChange={files.onInputChange} />
            <p>
              {files.uploading
                ? `Uploading ${files.uploadName ?? "file"}…`
                : "Drop a file here or choose one"}
            </p>
            {files.uploading ? (
              <div className="issue-attachment-progress" aria-hidden>
                <div
                  className="issue-attachment-progress-bar"
                  style={{ width: `${files.uploadProgress ?? 0}%` }}
                />
              </div>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={files.uploading}
              onClick={files.chooseFile}
            >
              Choose file
            </button>
            <p className="muted issue-attachment-limits">
              {describeAttachmentLimits(files.limits, 2)}
            </p>
          </div>
        </section>
      </div>

      <AttachmentLightboxes list={files} />
    </Drawer>
  );
}
