import { useCallback, useMemo, useState } from "react";
import type { IssueAttachmentPublic, TeamFilePublic } from "@teamflow/core";
import {
  FILE_TRASH_RETENTION_DAYS,
  getTeamFileDisplayName,
  isZipAttachmentFile,
} from "@teamflow/core";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "../ui/confirmContext";
import { client } from "../api";
import { queryKeys } from "../queries/keys";
import { useTeamFilesQuery } from "../queries/files";
import { Drawer } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";
import { getSharedTeamFilePreviewCache } from "../lib/teamFilePreviewCache";
import { AttachmentLightbox } from "./AttachmentImagePreview";
import { AttachmentVideoLightbox } from "./AttachmentVideoPlayer";
import { FileRefCopyButton } from "./FileRefCopyButton";
import { TeamFileEditableName } from "./TeamFileEditableName";
import { filePreviewAttachment, TeamFilePreview } from "./TeamFilePreview";
import { formatFileSize } from "../lib/format";
import { downloadAttachmentFile } from "../lib/download";

function formatPurgeDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fileDescription(file: TeamFilePublic, inTrash: boolean) {
  if (inTrash && file.purgeAt) {
    const when = formatPurgeDate(file.purgeAt);
    return when ? `Purges ${when}` : "Purges soon";
  }

  if (file.references.length === 0) {
    return `${formatFileSize(file.sizeBytes)} · not linked yet`;
  }

  const linked = file.references
    .slice(0, 2)
    .map((ref) =>
      ref.kind === "issue" ? `${ref.ref} — ${ref.name}` : `Row ${ref.ref} — ${ref.name}`,
    )
    .join(" · ");

  if (file.references.length > 2) {
    return `${linked} · +${file.references.length - 2} more`;
  }

  return linked;
}

function canDownloadFile(file: TeamFilePublic) {
  return file.references.length > 0;
}

type TeamFilesDrawerProps = {
  teamId: string;
  open: boolean;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

const NO_FILES: TeamFilePublic[] = [];

type SortMode = "size" | "name" | "refs";
type FilesTab = "active" | "trash";

export function TeamFilesDrawer({ teamId, open, onClose, onNavigateRef }: TeamFilesDrawerProps) {
  const [tab, setTab] = useState<FilesTab>("active");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const filesQuery = useTeamFilesQuery(teamId, tab === "trash", open);
  const files = filesQuery.data?.files ?? NO_FILES;
  const totalBytes = filesQuery.data?.totalBytes ?? 0;
  const loading = filesQuery.isFetching;
  const [actionError, setError] = useState<string | null>(null);
  const error =
    actionError ??
    (filesQuery.error
      ? filesQuery.error instanceof Error
        ? filesQuery.error.message
        : "Could not load team files"
      : null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("size");
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [imageLightbox, setImageLightbox] = useState<{
    attachment: IssueAttachmentPublic;
    imageUrl: string;
  } | null>(null);
  const [videoLightbox, setVideoLightbox] = useState<IssueAttachmentPublic | null>(null);
  const previewCache = useMemo(() => getSharedTeamFilePreviewCache(), []);

  const loadFiles = useCallback(async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["files", teamId] });
  }, [queryClient, teamId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let next = files;
    if (q) {
      next = files.filter((file) => {
        const displayName = getTeamFileDisplayName(file);
        const haystack = [
          file.filename,
          displayName,
          file.fileRef,
          file.uploaderName,
          ...file.references.map((ref) => `${ref.ref} ${ref.name}`),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return [...next].sort((a, b) => {
      const aName = getTeamFileDisplayName(a);
      const bName = getTeamFileDisplayName(b);
      if (sort === "name") return aName.localeCompare(bName);
      if (sort === "refs") {
        if (b.linkCount !== a.linkCount) return b.linkCount - a.linkCount;
        return b.sizeBytes - a.sizeBytes;
      }
      if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
      return aName.localeCompare(bName);
    });
  }, [files, query, sort]);

  const handleClose = useCallback(() => {
    setQuery("");
    setTab("active");
    setImageLightbox(null);
    setVideoLightbox(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  async function softDelete(file: TeamFilePublic) {
    const displayName = getTeamFileDisplayName(file);
    const ok = await confirm({
      title: `Move ${displayName} to trash?`,
      message: `It stays in trash for ${FILE_TRASH_RETENTION_DAYS} days.`,
      confirmLabel: "Move to trash",
      danger: true,
    });
    if (!ok) return;
    setBusyFileId(file.fileId);
    try {
      await client.softDeleteTeamFile(teamId, file.fileId);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete file");
    } finally {
      setBusyFileId(null);
    }
  }

  async function restore(file: TeamFilePublic) {
    setBusyFileId(file.fileId);
    try {
      await client.restoreTeamFile(teamId, file.fileId);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore file");
    } finally {
      setBusyFileId(null);
    }
  }

  async function downloadFile(file: TeamFilePublic) {
    const attachment = filePreviewAttachment(file);
    if (!attachment) return;

    setDownloadingFileId(file.fileId);
    try {
      await downloadAttachmentFile(attachment.id, getTeamFileDisplayName(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingFileId(null);
    }
  }

  function handleFileRenamed(fileId: string, filename: string) {
    queryClient.setQueryData<{ files: TeamFilePublic[] }>(
      queryKeys.teamFiles(teamId, tab === "trash"),
      (data) =>
        data && {
          ...data,
          files: data.files.map((file) => (file.fileId === fileId ? { ...file, filename } : file)),
        },
    );
  }

  async function downloadAttachment(attachment: IssueAttachmentPublic) {
    await downloadAttachmentFile(attachment.id, attachment.filename);
  }

  return (
    <Drawer onClose={handleClose} className="team-files-drawer">
      <header className="team-files-drawer-header">
        <div>
          <p className="eyebrow">Team files</p>
          <DialogTitle>File directory</DialogTitle>
          <p className="muted team-files-drawer-summary">
            {files.length} file{files.length === 1 ? "" : "s"} · {formatFileSize(totalBytes)} total
            {tab === "trash" ? ` · purged after ${FILE_TRASH_RETENTION_DAYS} days` : ""}
          </p>
        </div>
        <button
          type="button"
          className="ghost drawer-close-btn"
          aria-label="Close"
          title="Close (Esc)"
          onClick={handleClose}
        >
          ✕
        </button>
      </header>

      <div className="segmented team-files-tabs" role="group" aria-label="Show">
        <button
          type="button"
          className={tab === "active" ? "active" : undefined}
          aria-pressed={tab === "active"}
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={tab === "trash" ? "active" : undefined}
          aria-pressed={tab === "trash"}
          onClick={() => setTab("trash")}
        >
          Trash
        </button>
      </div>

      <div className="team-files-drawer-toolbar">
        <input
          type="search"
          value={query}
          placeholder="Search filename, ref, issue, row…"
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <label className="team-files-sort">
          <span className="sr-only">Sort files</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="size">Largest first</option>
            <option value="name">Name</option>
            <option value="refs">Most linked</option>
          </select>
        </label>
      </div>

      <div className="team-files-drawer-body">
        {loading ? (
          <p className="muted">Loading files…</p>
        ) : error ? (
          <p className="team-files-drawer-error">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="team-files-empty">
            <p>
              {query
                ? "No files match your search."
                : tab === "trash"
                  ? "Trash is empty."
                  : "No files yet."}
            </p>
            {!query && tab === "active" ? (
              <p className="muted">
                Files appear here once they are uploaded to an issue&apos;s Attachments or a
                row&apos;s Files.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="team-files-list">
            {filtered.map((file) => {
              const displayName = getTeamFileDisplayName(file);
              const showDownload =
                canDownloadFile(file) &&
                (isZipAttachmentFile(file.filename, file.mimeType) || file.kind === "other");

              return (
                <li key={file.fileId} className="team-files-item">
                  <div className="team-files-item-main">
                    <div className="team-files-item-preview-wrap">
                      <TeamFilePreview
                        file={file}
                        previewCache={previewCache}
                        onImageOpen={(attachment, imageUrl) =>
                          setImageLightbox({ attachment, imageUrl })
                        }
                        onVideoOpen={setVideoLightbox}
                      />
                    </div>

                    <div className="team-files-item-center">
                      <div className="team-files-item-copy">
                        <div className="team-files-item-title-row">
                          <TeamFileEditableName
                            teamId={teamId}
                            file={file}
                            disabled={tab === "trash" || busyFileId === file.fileId}
                            onRenamed={handleFileRenamed}
                            onError={setError}
                          />
                          <span className="team-files-link-badge">
                            {file.linkCount} link{file.linkCount === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p
                          className="team-files-item-description muted"
                          title={fileDescription(file, tab === "trash")}
                        >
                          {fileDescription(file, tab === "trash")}
                        </p>
                      </div>
                      <div className="team-files-item-footer">
                        <span className="team-files-item-uploader muted">
                          by {file.uploaderName}
                        </span>
                        <code className="team-files-item-fileref" title="Assigned file link name">
                          {file.fileRef}
                        </code>
                      </div>
                    </div>

                    <div className="team-files-item-actions">
                      {file.references.length > 0 && onNavigateRef ? (
                        <label className="team-files-ref-select team-files-action-btn">
                          <span className="sr-only">Jump to linked location for {displayName}</span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              const ref = event.target.value;
                              if (!ref) return;
                              onNavigateRef(ref);
                              event.target.value = "";
                            }}
                          >
                            <option value="">Linked on…</option>
                            {file.references.map((ref) => (
                              <option key={`${ref.kind}-${ref.linkId}`} value={ref.ref}>
                                {ref.kind === "issue" ? "Issue" : "Row"} {ref.ref} — {ref.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="team-files-action-btn team-files-action-btn--placeholder muted">
                          Not linked
                        </span>
                      )}
                      <FileRefCopyButton
                        fileRef={file.fileRef}
                        filename={displayName}
                        compact={false}
                        className="team-files-action-btn"
                      />
                      {showDownload ? (
                        <button
                          type="button"
                          className="secondary team-files-action-btn"
                          disabled={downloadingFileId === file.fileId}
                          onClick={() => void downloadFile(file)}
                        >
                          {downloadingFileId === file.fileId ? "…" : "Download"}
                        </button>
                      ) : null}
                      {tab === "active" ? (
                        <button
                          type="button"
                          className="ghost team-files-delete-btn team-files-action-btn"
                          disabled={busyFileId === file.fileId}
                          onClick={() => void softDelete(file)}
                        >
                          {busyFileId === file.fileId ? "…" : "Delete"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary team-files-action-btn"
                          disabled={busyFileId === file.fileId}
                          onClick={() => void restore(file)}
                        >
                          {busyFileId === file.fileId ? "…" : "Restore"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {imageLightbox ? (
        <AttachmentLightbox
          attachment={imageLightbox.attachment}
          imageUrl={imageLightbox.imageUrl}
          onClose={() => setImageLightbox(null)}
          onDownload={() => void downloadAttachment(imageLightbox.attachment)}
        />
      ) : null}

      {videoLightbox ? (
        <AttachmentVideoLightbox
          attachment={videoLightbox}
          onClose={() => setVideoLightbox(null)}
          onDownload={() => void downloadAttachment(videoLightbox)}
        />
      ) : null}
    </Drawer>
  );
}
