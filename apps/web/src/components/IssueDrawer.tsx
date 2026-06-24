import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type {
  BoardRowPublic,
  CommentPublic,
  IssueAttachmentPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
  UpdateIssueInput,
} from "@teamflow/core";
import { PRIORITIES, DEFAULT_ATTACHMENT_LIMITS, maxBytesForAttachmentFile, isImageAttachmentFile } from "@teamflow/core";
import type { AttachmentLimitsPublic } from "@teamflow/core";
import { client } from "../api";
import { IssueTimer } from "./IssueTimer";
import { DescriptionEditor } from "./DescriptionEditor";
import { MultiAssigneePicker } from "./MultiAssigneePicker";
import { BoardColorPicker } from "./BoardColorPicker";
import { RefCopyButton } from "./RefCopyButton";
import { RichText } from "./RichText";
import { LinkPasteOffer } from "./LinkPasteOffer";
import { initials } from "../lib/timer";
import { useLinkPasteOffer } from "../hooks/useLinkPasteOffer";
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

function describeAttachmentLimits(limits: AttachmentLimitsPublic) {
  return `Images ${formatFileSize(limits.imageBytes)}, videos ${formatFileSize(limits.videoBytes)}, ZIPs ${formatFileSize(limits.zipBytes)}`;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTimestamp(value: string) {
  const trimmed = value.trim();
  const sqliteLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const date = sqliteLike.test(trimmed)
    ? new Date(trimmed.replace(" ", "T") + "Z")
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateInputValue(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type IssueDrawerProps = {
  issue: IssuePublic;
  members: TeamMemberPublic[];
  statuses: IssueStatusPublic[];
  rows: BoardRowPublic[];
  currentUserId: string | null;
  onClose: () => void;
  onUpdate: (issue: IssuePublic) => void;
  onDelete: (issue: IssuePublic) => void;
  onNavigateRef?: (ref: string) => void;
};

export function IssueDrawer({
  issue,
  members,
  statuses,
  rows,
  currentUserId,
  onClose,
  onUpdate,
  onDelete,
  onNavigateRef,
}: IssueDrawerProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [comments, setComments] = useState<CommentPublic[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
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
  const attachmentBlobCache = useMemo(() => createAttachmentBlobCache(), []);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    linkOffer: commentLinkOffer,
    handlePaste: handleCommentPaste,
    keepLink: keepCommentLink,
    shortenFromOffer: shortenCommentLinkFromOffer,
    openShortenOffer: openCommentShortenOffer,
    clearOfferOnEdit: clearCommentLinkOfferOnEdit,
    dismissOffer: dismissCommentLinkOffer,
  } = useLinkPasteOffer(commentDraft, setCommentDraft, commentTextareaRef);
  const [saving, setSaving] = useState(false);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refNavActive, setRefNavActive] = useState(false);
  const prevIssueIdRef = useRef(issue.id);
  const refNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rowStatuses = statuses
    .filter((status) => status.rowId === issue.rowId)
    .sort((a, b) => a.position - b.position);

  const patchIssue = useCallback(
    async (patch: UpdateIssueInput) => {
      setSaving(true);
      try {
        const { issue: updated } = await client.updateIssue(issue.id, patch);
        onUpdate(updated);
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [issue.id, onUpdate],
  );

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description ?? "");
  }, [issue.id, issue.title, issue.description]);

  useEffect(() => {
    let cancelled = false;
    setAttachmentsLoading(true);

    void client
      .listAttachments(issue.id)
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
  }, [issue.id]);

  useEffect(() => {
    attachmentBlobCache.revokeAll();
    setAttachmentLightbox(null);
    setAttachmentVideo(null);
    return () => attachmentBlobCache.revokeAll();
  }, [issue.id, attachmentBlobCache]);

  useEffect(() => {
    let cancelled = false;
    setCommentsLoading(true);

    void client
      .getIssue(issue.id)
      .then(({ comments: loaded }) => {
        if (!cancelled) setComments(loaded);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [issue.id]);

  useEffect(
    () => () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      if (descriptionTimerRef.current) clearTimeout(descriptionTimerRef.current);
      if (refNavTimerRef.current) clearTimeout(refNavTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (prevIssueIdRef.current === issue.id) return;
    prevIssueIdRef.current = issue.id;
    setRefNavActive(true);
    if (refNavTimerRef.current) clearTimeout(refNavTimerRef.current);
    refNavTimerRef.current = setTimeout(() => setRefNavActive(false), 380);
  }, [issue.id]);

  function queueTitleSave(nextTitle: string) {
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      const trimmed = nextTitle.trim();
      if (!trimmed || trimmed === issue.title) return;
      void patchIssue({ title: trimmed });
    }, 500);
  }

  function queueDescriptionSave(nextDescription: string) {
    if (descriptionTimerRef.current) clearTimeout(descriptionTimerRef.current);
    descriptionTimerRef.current = setTimeout(() => {
      const normalized = nextDescription.trim();
      const current = issue.description ?? "";
      if (normalized === current) return;
      void patchIssue({ description: normalized || "" });
    }, 500);
  }

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
      const { attachment } = await client.uploadFile(issue.id, file, {
        limits: attachmentLimits,
        onProgress: (percent) => setAttachmentUploadProgress(percent),
      });
      setAttachments((prev) => [...prev, attachment]);
      if (isImageAttachmentFile(file.name, file.type || "")) {
        attachmentBlobCache.set(attachment.id, URL.createObjectURL(file));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
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

  function handleAttachmentDrop(event: DragEvent) {
    event.preventDefault();
    setAttachmentDragOver(false);
    const file = event.dataTransfer.files[0];
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
      const message =
        error instanceof Error ? error.message : "Download failed";
      window.alert(message);
    }
  }

  async function deleteAttachment(attachment: IssueAttachmentPublic) {
    if (!window.confirm(`Remove ${attachment.filename}?`)) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await client.deleteAttachment(issue.id, attachment.id);
      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      const { comment } = await client.addComment(issue.id, { body });
      setComments((prev) => [...prev, comment]);
      setCommentDraft("");
      dismissCommentLinkOffer();
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function deleteComment(comment: CommentPublic) {
    if (deletingCommentId) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingCommentId(comment.id);
    try {
      await client.deleteComment(issue.id, comment.id);
      setComments((prev) => prev.filter((item) => item.id !== comment.id));
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function markDone() {
    const { issue: updated } = await client.completeIssue(issue.id);
    onUpdate(updated);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className={`drawer issue-drawer ${refNavActive ? "issue-drawer--ref-nav" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="issue-drawer-header">
          <div className="issue-drawer-header-ids">
            <div className="issue-drawer-id-row">
              <p className="eyebrow issue-drawer-id">{issue.identifier}</p>
              <RefCopyButton
                value={issue.identifier}
                variant="issue"
                display="icon"
                share
                title={`Issue ${issue.identifier}`}
                onGo={onNavigateRef ? () => onNavigateRef(issue.identifier) : undefined}
              />
            </div>
            {saving && <span className="issue-drawer-saving">Saving…</span>}
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div
          className={`issue-drawer-surface ${refNavActive ? "issue-drawer-surface--ref-nav" : ""}`}
        >
        <div className="issue-drawer-hero">
          <input
            className="issue-drawer-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              queueTitleSave(e.target.value);
            }}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== issue.title) {
                void patchIssue({ title: trimmed });
              }
            }}
            aria-label="Issue title"
          />
          <div className="issue-drawer-timestamps">
            <p>
              <span className="issue-drawer-timestamp-label">Created</span>
              <span>{formatTimestamp(issue.createdAt)}</span>
              <span className="issue-drawer-timestamp-by">by {issue.creatorName}</span>
            </p>
            <p>
              <span className="issue-drawer-timestamp-label">Edited</span>
              <span>{formatTimestamp(issue.updatedAt)}</span>
            </p>
            {issue.completedAt && (
              <p>
                <span className="issue-drawer-timestamp-label">Completed</span>
                <span>{formatTimestamp(issue.completedAt)}</span>
              </p>
            )}
          </div>
        </div>

        <section className="issue-drawer-section issue-drawer-section--status">
          <h3>Status</h3>
          <div className="issue-drawer-meta">
          <label className="issue-drawer-field">
            <span className="issue-drawer-label">Status</span>
            <select
              value={issue.statusId}
              onChange={(e) => {
                void patchIssue({ statusId: e.target.value });
              }}
            >
              {rowStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>

          <label className="issue-drawer-field">
            <span className="issue-drawer-label">Priority</span>
            <select
              value={issue.priority}
              onChange={(e) => {
                void patchIssue({ priority: e.target.value as Priority });
              }}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>

          <div className="issue-drawer-field">
            <span className="issue-drawer-label">Card color</span>
            <BoardColorPicker
              color={issue.color}
              onSelect={(color) => {
                void patchIssue({ color });
              }}
              title="Card color"
              hint="Left accent on the board card."
            />
          </div>

          {rows.length > 1 && (
            <label className="issue-drawer-field">
              <span className="issue-drawer-label">Row</span>
              <select
                value={issue.rowId ?? ""}
                onChange={(e) => {
                  const rowId = e.target.value || null;
                  void patchIssue({ rowId });
                }}
              >
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="issue-drawer-field">
            <span className="issue-drawer-label">Due</span>
            <input
              type="datetime-local"
              value={toDateInputValue(issue.dueDate)}
              onChange={(e) => {
                void patchIssue({ dueDate: fromDateInputValue(e.target.value) });
              }}
            />
          </label>

          <div className="issue-drawer-field issue-drawer-field--assignee">
            <span className="issue-drawer-label">Assignees</span>
            <MultiAssigneePicker
              members={members}
              assigneeIds={
                issue.assignees?.map((assignee) => assignee.userId) ??
                (issue.assigneeId ? [issue.assigneeId] : [])
              }
              onChange={(assigneeIds) => {
                void patchIssue({ assigneeIds });
              }}
            />
          </div>

          <div className="issue-drawer-field issue-drawer-field--timer">
            <span className="issue-drawer-label">Timer</span>
            <IssueTimer
              issue={issue}
              onUpdate={(patch) => {
                void patchIssue(patch);
              }}
            />
          </div>
          </div>
        </section>

        <section className="issue-drawer-section issue-drawer-section--description">
          <DescriptionEditor
            key={issue.id}
            value={description}
            onChange={(nextDescription) => {
              setDescription(nextDescription);
              queueDescriptionSave(nextDescription);
            }}
            onBlur={() => {
              const normalized = description.trim();
              const current = issue.description ?? "";
              if (normalized !== current) {
                void patchIssue({ description: normalized || "" });
              }
            }}
            onNavigateRef={onNavigateRef}
          />
        </section>

        <section className="issue-drawer-section">
          <h3>Attachments</h3>
          {attachmentsLoading ? (
            <p className="muted">Loading attachments…</p>
          ) : attachments.length === 0 ? (
            <p className="muted">No files attached yet.</p>
          ) : (
            <ul className="issue-attachment-list">
              {attachments.map((attachment) => (
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
                      {formatFileSize(attachment.sizeBytes)} · {attachment.uploaderName} ·{" "}
                      {formatTimestamp(attachment.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ghost issue-attachment-delete"
                    disabled={deletingAttachmentId === attachment.id}
                    onClick={() => void deleteAttachment(attachment)}
                    aria-label={`Remove ${attachment.filename}`}
                    title="Remove attachment"
                  >
                    {deletingAttachmentId === attachment.id ? "…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

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
              className="issue-attachment-input"
              onChange={handleAttachmentInputChange}
            />
            <p>
              {uploadingAttachment
                ? `Uploading ${attachmentUploadName ?? "file"}…`
                : `Drop a file here or choose one (${describeAttachmentLimits(attachmentLimits)}).`}
            </p>
            {uploadingAttachment ? (
              <div
                className="issue-attachment-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={attachmentUploadProgress ?? 0}
                aria-label="Upload progress"
              >
                <div
                  className={`issue-attachment-progress-bar${
                    attachmentUploadProgress == null
                      ? " issue-attachment-progress-bar--indeterminate"
                      : ""
                  }`}
                  style={
                    attachmentUploadProgress != null
                      ? { width: `${attachmentUploadProgress}%` }
                      : undefined
                  }
                />
              </div>
            ) : null}
            <button
              type="button"
              className="ghost"
              disabled={uploadingAttachment}
              onClick={() => attachmentInputRef.current?.click()}
            >
              Choose file
            </button>
          </div>
        </section>

        <section className="issue-drawer-section">
          <h3>Comments</h3>
          {commentsLoading ? (
            <p className="muted">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="muted">No comments yet.</p>
          ) : (
            <ul className="issue-comment-list">
              {comments.map((comment) => (
                <li key={comment.id} className="issue-comment">
                  <div className="issue-comment-head">
                    <span className="assignee-avatar filled">
                      {initials(comment.authorName)}
                    </span>
                    <div className="issue-comment-head-main">
                      <strong>{comment.authorName}</strong>
                      <span className="issue-comment-time">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                    </div>
                    {currentUserId === comment.authorId && (
                      <button
                        type="button"
                        className="ghost issue-comment-delete"
                        disabled={deletingCommentId === comment.id}
                        onClick={() => void deleteComment(comment)}
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        {deletingCommentId === comment.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                  <p className="issue-comment-body">
                    <RichText text={comment.body} onRef={onNavigateRef} />
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="issue-comment-compose">
            <textarea
              ref={commentTextareaRef}
              value={commentDraft}
              onChange={(e) => {
                setCommentDraft(e.target.value);
                clearCommentLinkOfferOnEdit();
              }}
              placeholder="Leave a comment… Pasted links are clickable automatically."
              rows={3}
              onPaste={handleCommentPaste}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submitComment();
                }
              }}
            />
            <LinkPasteOffer
              target={commentLinkOffer}
              onKeep={keepCommentLink}
              onShorten={shortenCommentLinkFromOffer}
            />
            <div className="issue-comment-compose-actions">
              <div className="issue-comment-compose-left">
                <button
                  type="button"
                  className="ghost"
                  disabled={!/https?:\/\//.test(commentDraft)}
                  onClick={openCommentShortenOffer}
                  title="Choose a short display label for a URL"
                >
                  Shorten link
                </button>
                <span className="muted">Ctrl+Enter to post</span>
              </div>
              <button
                type="button"
                disabled={!commentDraft.trim() || commentSubmitting}
                onClick={() => void submitComment()}
              >
                {commentSubmitting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </section>

        <div className="row drawer-actions issue-drawer-actions">
          <button type="button" onClick={() => void markDone()}>
            Mark done
          </button>
          <button type="button" className="danger" onClick={() => onDelete(issue)}>
            Delete
          </button>
        </div>
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
