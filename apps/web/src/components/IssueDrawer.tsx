import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BoardRowPublic,
  CommentPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
  UpdateIssueInput,
} from "@teamflow/core";
import { PRIORITIES, PRIORITY_LABELS } from "@teamflow/core";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "../ui/confirmContext";
import { client } from "../api";
import { queryKeys } from "../queries/keys";
import { useIssueQuery } from "../queries/issue";
import { useAttachmentList } from "../hooks/useAttachmentList";
import { AttachmentLightboxes } from "./AttachmentLightboxes";
import { IssueTimer } from "./IssueTimer";
import { DescriptionEditor } from "./DescriptionEditor";
import { MultiAssigneePicker } from "./MultiAssigneePicker";
import { BoardColorPicker } from "./BoardColorPicker";
import { FileRefCopyButton } from "./FileRefCopyButton";
import { RefCopyButton } from "./RefCopyButton";
import { RichText } from "./RichText";
import { LinkPasteOffer } from "./LinkPasteOffer";
import { initials } from "../lib/timer";
import { useLinkPasteOffer } from "../hooks/useLinkPasteOffer";
import { Drawer } from "../ui/Dialog";
import { AttachmentImageThumbnail, isImageAttachment } from "./AttachmentImagePreview";
import { AttachmentVideoThumbnail, isVideoAttachment } from "./AttachmentVideoPlayer";
import { LinkRowFilePanel } from "./LinkRowFilePanel";
import { describeAttachmentLimits, formatFileSize, formatTimestamp } from "../lib/format";

const NO_COMMENTS: CommentPublic[] = [];

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
  /** Save a change; the board cache (and so `issue`) updates optimistically. */
  onPatch: (patch: UpdateIssueInput) => Promise<unknown>;
  onComplete: () => Promise<unknown>;
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
  onPatch,
  onComplete,
  onDelete,
  onNavigateRef,
}: IssueDrawerProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const issueQuery = useIssueQuery(issue.id);
  const comments = issueQuery.data?.comments ?? NO_COMMENTS;
  const commentsLoading = issueQuery.isPending;
  const { bindFileInput, ...files } = useAttachmentList({ kind: "issue", id: issue.id });
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
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

  const issueRow = useMemo(
    () => (issue.rowId ? (rows.find((row) => row.id === issue.rowId) ?? null) : null),
    [issue.rowId, rows],
  );

  const patchIssue = useCallback(
    async (patch: UpdateIssueInput) => {
      setSaving(true);
      try {
        await onPatch(patch);
      } finally {
        setSaving(false);
      }
    },
    [onPatch],
  );

  useEffect(() => {
    setTitle(issue.title);
    setDescription(issue.description ?? "");
  }, [issue.id, issue.title, issue.description]);

  function setComments(update: (prev: CommentPublic[]) => CommentPublic[]) {
    queryClient.setQueryData<{ issue: IssuePublic; comments: CommentPublic[] }>(
      queryKeys.issue(issue.id),
      (data) => (data ? { ...data, comments: update(data.comments) } : data),
    );
  }

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
    if (!(await confirm({ title: "Delete this comment?", confirmLabel: "Delete", danger: true })))
      return;

    setDeletingCommentId(comment.id);
    try {
      await client.deleteComment(issue.id, comment.id);
      setComments((prev) => prev.filter((item) => item.id !== comment.id));
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function markDone() {
    await onComplete();
  }

  function handleDrawerClose() {
    files.release();
    onClose();
  }

  return (
    <Drawer
      onClose={handleDrawerClose}
      className={`issue-drawer ${refNavActive ? "issue-drawer--ref-nav" : ""}`}
      label={`${issue.identifier} ${issue.title}`}
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
        <button type="button" className="ghost" onClick={handleDrawerClose}>
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
          {files.loading ? (
            <p className="muted">Loading attachments…</p>
          ) : files.attachments.length === 0 ? (
            <p className="muted">No files attached yet.</p>
          ) : (
            <ul className="issue-attachment-list">
              {files.attachments.map((attachment) => (
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
                      {attachment.fileRef} · {formatFileSize(attachment.sizeBytes)} ·{" "}
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
                      title="Remove attachment"
                    >
                      {files.deletingId === attachment.id ? "…" : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <LinkRowFilePanel
            teamId={issue.teamId}
            issueId={issue.id}
            row={issueRow}
            linkedFileIds={files.linkedFileIds}
            onLinked={files.addLinked}
          />

          <div
            className={`issue-attachment-drop${files.dragOver ? " issue-attachment-drop--active" : ""}`}
            {...files.dropZoneProps}
          >
            <input
              ref={bindFileInput}
              type="file"
              className="issue-attachment-input"
              onChange={files.onInputChange}
            />
            <p>
              {files.uploading
                ? `Uploading ${files.uploadName ?? "file"}…`
                : `Drop a file here or choose one (${describeAttachmentLimits(files.limits)}).`}
            </p>
            {files.uploading ? (
              <div
                className="issue-attachment-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={files.uploadProgress ?? 0}
                aria-label="Upload progress"
              >
                <div
                  className={`issue-attachment-progress-bar${
                    files.uploadProgress == null
                      ? " issue-attachment-progress-bar--indeterminate"
                      : ""
                  }`}
                  style={
                    files.uploadProgress != null ? { width: `${files.uploadProgress}%` } : undefined
                  }
                />
              </div>
            ) : null}
            <button
              type="button"
              className="ghost"
              disabled={files.uploading}
              onClick={files.chooseFile}
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
                    <span className="assignee-avatar filled">{initials(comment.authorName)}</span>
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
      <AttachmentLightboxes list={files} />
    </Drawer>
  );
}
