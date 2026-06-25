import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { BoardRowPublic, IssueAttachmentPublic } from "@teamflow/core";
import {
  DEFAULT_ATTACHMENT_LIMITS,
  isImageAttachmentFile,
  maxBytesForAttachmentFile,
} from "@teamflow/core";
import type { AttachmentLimitsPublic } from "@teamflow/core";
import { client } from "../api";
import { FileRefCopyButton } from "./FileRefCopyButton";
import { LinkFromFileRef } from "./LinkFromFileRef";
import { RefCopyButton } from "./RefCopyButton";
import {
  AttachmentImageThumbnail,
  AttachmentLightbox,
  createAttachmentBlobCache,
  isImageAttachment,
} from "./AttachmentImagePreview";
import {
  AttachmentVideoLightbox,
  AttachmentVideoThumbnail,
  isVideoAttachment,
} from "./AttachmentVideoPlayer";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function describeAttachmentLimits(limits: AttachmentLimitsPublic) {
  return `Images ${formatFileSize(limits.imageBytes)}, videos ${formatFileSize(limits.videoBytes)}, ZIPs ${formatFileSize(limits.zipBytes)}`;
}

type RowFilesDrawerProps = {
  row: BoardRowPublic;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

export function RowFilesDrawer({ row, onClose, onNavigateRef }: RowFilesDrawerProps) {
  const [attachments, setAttachments] = useState<IssueAttachmentPublic[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number | null>(
    null,
  );
  const [attachmentUploadName, setAttachmentUploadName] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const [attachmentLimits, setAttachmentLimits] = useState<AttachmentLimitsPublic>(
    DEFAULT_ATTACHMENT_LIMITS,
  );
  const [attachmentLightbox, setAttachmentLightbox] = useState<{
    attachment: IssueAttachmentPublic;
    imageUrl: string;
  } | null>(null);
  const [attachmentVideo, setAttachmentVideo] = useState<IssueAttachmentPublic | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const attachmentBlobCache = useMemo(() => createAttachmentBlobCache(), []);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setAttachmentLightbox(null);
    setAttachmentVideo(null);
    attachmentBlobCache.revokeAll();
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    setAttachmentsLoading(true);

    void client
      .listRowAttachments(row.id)
      .then(({ attachments: loaded, limits }) => {
        if (!cancelled) {
          setAttachments(loaded);
          setAttachmentLimits(limits);
        }
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setAttachmentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [row.id]);

  useEffect(() => {
    return () => attachmentBlobCache.revokeAll();
  }, [attachmentBlobCache]);

  const linkedFileIds = useMemo(
    () => new Set(attachments.map((attachment) => attachment.fileId)),
    [attachments],
  );

  const filteredAttachments = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return attachments;
    return attachments.filter((attachment) => {
      const hay = `${attachment.filename} ${attachment.fileRef} ${attachment.uploaderName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [attachments, fileSearch]);

  async function openImagePreview(attachment: IssueAttachmentPublic) {
    try {
      const imageUrl = await attachmentBlobCache.get(attachment.id);
      setAttachmentLightbox({ attachment, imageUrl });
    } catch {
      window.alert("Could not load image preview.");
    }
  }

  async function uploadAttachmentFile(file: File) {
    if (uploadingAttachment) return;
    const maxBytes = maxBytesForAttachmentFile(
      file.name,
      file.type || "application/octet-stream",
      attachmentLimits,
    );
    if (file.size > maxBytes) {
      window.alert(
        `File is too large (${formatFileSize(file.size)}). Max for this type is ${formatFileSize(maxBytes)}.`,
      );
      return;
    }
    setUploadingAttachment(true);
    setAttachmentUploadProgress(0);
    setAttachmentUploadName(file.name);
    try {
      const { attachment } = await client.uploadRowFile(row.id, file, {
        limits: attachmentLimits,
        onProgress: (percent) => setAttachmentUploadProgress(percent),
      });
      setAttachments((prev) => [...prev, attachment]);
      if (isImageAttachmentFile(file.name, file.type || "")) {
        attachmentBlobCache.set(attachment.id, URL.createObjectURL(file));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      window.alert(message);
    } finally {
      setUploadingAttachment(false);
      setAttachmentUploadProgress(null);
      setAttachmentUploadName(null);
    }
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadAttachmentFile(file);
  }

  function handleAttachmentDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setAttachmentDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadAttachmentFile(file);
  }

  async function downloadAttachment(attachment: IssueAttachmentPublic) {
    try {
      const blob = await client.downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      window.alert(message);
    }
  }

  async function deleteAttachment(attachment: IssueAttachmentPublic) {
    if (!window.confirm(`Remove ${attachment.filename}?`)) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await client.deleteRowAttachment(row.id, attachment.id);
      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={handleClose}>
      <aside className="drawer issue-drawer" onClick={(event) => event.stopPropagation()}>
        <header className="issue-drawer-header">
          <div className="issue-drawer-header-ids">
            <div className="issue-drawer-id-row">
              <p className="eyebrow issue-drawer-id">{row.key}</p>
              <RefCopyButton
                value={row.key}
                display="icon"
                share
                title={`Row ${row.name}`}
                onGo={onNavigateRef ? () => onNavigateRef(row.key) : undefined}
              />
            </div>
            <h2 className="issue-drawer-title" style={{ margin: 0 }}>
              {row.name} — shared files
            </h2>
          </div>
          <button type="button" className="ghost" onClick={handleClose}>
            Close
          </button>
        </header>

        <div className="issue-drawer-surface">
          <section className="issue-drawer-section">
            <p className="muted" style={{ marginTop: 0 }}>
              Tools, docs, and assets for everyone working in this row.
            </p>
            <p className="muted" style={{ marginTop: 0 }}>
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

            {attachmentsLoading ? (
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
                        onOpen={() => setAttachmentVideo(attachment)}
                      />
                    ) : isImageAttachment(attachment) ? (
                      <AttachmentImageThumbnail
                        attachment={attachment}
                        blobCache={attachmentBlobCache}
                        onOpen={(imageUrl) =>
                          setAttachmentLightbox({ attachment, imageUrl })
                        }
                      />
                    ) : null}
                    <div className="issue-attachment-main">
                      <button
                        type="button"
                        className="ghost issue-attachment-name"
                        onClick={() => {
                          if (isVideoAttachment(attachment)) {
                            setAttachmentVideo(attachment);
                            return;
                          }
                          if (isImageAttachment(attachment)) {
                            void openImagePreview(attachment);
                            return;
                          }
                          void downloadAttachment(attachment);
                        }}
                      >
                        {attachment.filename}
                      </button>
                      <span className="issue-attachment-meta muted">
                        {attachment.fileRef} · {formatFileSize(attachment.sizeBytes)} ·{" "}
                        {attachment.uploaderName} · {formatTimestamp(attachment.createdAt)}
                      </span>
                    </div>
                    <div className="issue-attachment-actions">
                      <FileRefCopyButton fileRef={attachment.fileRef} filename={attachment.filename} />
                      <button
                      type="button"
                      className="ghost issue-attachment-delete"
                      disabled={deletingAttachmentId === attachment.id}
                      onClick={() => void deleteAttachment(attachment)}
                      aria-label={`Remove ${attachment.filename}`}
                      title="Remove file"
                    >
                      {deletingAttachmentId === attachment.id ? "…" : "Remove"}
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
                if (linkedFileIds.has(fileId)) return;
                const { attachment } = await client.linkRowAttachment(row.id, fileId);
                setAttachments((prev) => {
                  if (prev.some((item) => item.fileId === attachment.fileId)) return prev;
                  return [...prev, attachment];
                });
              }}
            />

            <div
              className={`issue-attachment-drop${attachmentDragOver ? " issue-attachment-drop--active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setAttachmentDragOver(true);
              }}
              onDragLeave={() => setAttachmentDragOver(false)}
              onDrop={handleAttachmentDrop}
            >
              <input
                ref={attachmentInputRef}
                type="file"
                hidden
                onChange={handleAttachmentInputChange}
              />
              <p>
                {uploadingAttachment
                  ? `Uploading ${attachmentUploadName ?? "file"}…`
                  : "Drop a file here or choose one"}
              </p>
              {uploadingAttachment ? (
                <div className="issue-attachment-progress" aria-hidden>
                  <div
                    className="issue-attachment-progress-bar"
                    style={{ width: `${attachmentUploadProgress ?? 0}%` }}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="secondary"
                disabled={uploadingAttachment}
                onClick={() => attachmentInputRef.current?.click()}
              >
                Choose file
              </button>
              <p className="muted issue-attachment-limits">
                {describeAttachmentLimits(attachmentLimits)}
              </p>
            </div>
          </section>
        </div>
      </aside>

      {attachmentLightbox ? (
        <AttachmentLightbox
          attachment={attachmentLightbox.attachment}
          imageUrl={attachmentLightbox.imageUrl}
          onClose={() => setAttachmentLightbox(null)}
          onDownload={() => void downloadAttachment(attachmentLightbox.attachment)}
        />
      ) : null}
      {attachmentVideo ? (
        <AttachmentVideoLightbox
          attachment={attachmentVideo}
          onClose={() => setAttachmentVideo(null)}
          onDownload={() => void downloadAttachment(attachmentVideo)}
        />
      ) : null}
    </div>
  );
}
