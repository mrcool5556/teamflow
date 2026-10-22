import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { BoardRowPublic, IssueAttachmentPublic } from "@teamflow/core";
import {
  DEFAULT_ATTACHMENT_LIMITS,
  isImageAttachmentFile,
  maxBytesForAttachmentFile,
} from "@teamflow/core";
import type { AttachmentLimitsPublic } from "@teamflow/core";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "../ui/confirmContext";
import { useErrorSink } from "../lib/errorSink";
import { client } from "../api";
import { queryKeys } from "../queries/keys";
import { useRowAttachmentsQuery } from "../queries/attachments";
import { Drawer } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";
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
import { describeAttachmentLimits, formatFileSize, formatTimestamp } from "../lib/format";
import { downloadAttachmentFile } from "../lib/download";

const NO_ATTACHMENTS: IssueAttachmentPublic[] = [];

type RowFilesDrawerProps = {
  row: BoardRowPublic;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

export function RowFilesDrawer({ row, onClose, onNavigateRef }: RowFilesDrawerProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { report, show } = useErrorSink();
  const attachmentsQuery = useRowAttachmentsQuery(row.id);
  const attachments = attachmentsQuery.data?.attachments ?? NO_ATTACHMENTS;
  const attachmentsLoading = attachmentsQuery.isPending;
  const attachmentLimits = attachmentsQuery.data?.limits ?? DEFAULT_ATTACHMENT_LIMITS;
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number | null>(null);
  const [attachmentUploadName, setAttachmentUploadName] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);
  const [attachmentLightbox, setAttachmentLightbox] = useState<{
    attachment: IssueAttachmentPublic;
    imageUrl: string;
  } | null>(null);
  const [attachmentVideo, setAttachmentVideo] = useState<IssueAttachmentPublic | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const attachmentBlobCache = useMemo(() => createAttachmentBlobCache(), []);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setAttachmentLightbox(null);
    setAttachmentVideo(null);
    attachmentBlobCache.revokeAll();
    onClose();
  }, [attachmentBlobCache, onClose]);

  function setAttachments(update: (prev: IssueAttachmentPublic[]) => IssueAttachmentPublic[]) {
    queryClient.setQueryData<{
      attachments: IssueAttachmentPublic[];
      limits: AttachmentLimitsPublic;
    }>(queryKeys.rowAttachments(row.id), (data) =>
      data ? { ...data, attachments: update(data.attachments) } : data,
    );
  }

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
      const hay =
        `${attachment.filename} ${attachment.fileRef} ${attachment.uploaderName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [attachments, fileSearch]);

  async function openImagePreview(attachment: IssueAttachmentPublic) {
    try {
      const imageUrl = await attachmentBlobCache.get(attachment.id);
      setAttachmentLightbox({ attachment, imageUrl });
    } catch {
      show("Could not load image preview.");
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
      show(
        `File is too large (${formatFileSize(file.size, 2)}). Max for this type is ${formatFileSize(maxBytes, 2)}.`,
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
      report(error, "Upload failed");
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
      await downloadAttachmentFile(attachment.id, attachment.filename);
    } catch (error) {
      report(error, "Download failed");
    }
  }

  async function deleteAttachment(attachment: IssueAttachmentPublic) {
    const ok = await confirm({
      title: `Remove ${attachment.filename}?`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await client.deleteRowAttachment(row.id, attachment.id);
      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  return (
    <Drawer onClose={handleClose} className="issue-drawer">
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
          <DialogTitle className="issue-drawer-title" style={{ margin: 0 }}>
            {row.name} — shared files
          </DialogTitle>
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
                      onOpen={(imageUrl) => setAttachmentLightbox({ attachment, imageUrl })}
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
              {describeAttachmentLimits(attachmentLimits, 2)}
            </p>
          </div>
        </section>
      </div>

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
    </Drawer>
  );
}
