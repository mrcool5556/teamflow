import { useCallback, useEffect, useMemo, useState } from "react";
import type { IssueAttachmentPublic, TeamFilePublic } from "@teamflow/core";
import { FILE_TRASH_RETENTION_DAYS } from "@teamflow/core";
import { client } from "../api";
import { AttachmentLightbox, createAttachmentBlobCache } from "./AttachmentImagePreview";
import { AttachmentVideoLightbox } from "./AttachmentVideoPlayer";
import { FileRefCopyButton } from "./FileRefCopyButton";
import { TeamFilePreview } from "./TeamFilePreview";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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
    return `${file.fileRef} · ${formatFileSize(file.sizeBytes)}`;
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

type TeamFilesDrawerProps = {
  teamId: string;
  open: boolean;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

type SortMode = "size" | "name" | "refs";
type FilesTab = "active" | "trash";

export function TeamFilesDrawer({
  teamId,
  open,
  onClose,
  onNavigateRef,
}: TeamFilesDrawerProps) {
  const [tab, setTab] = useState<FilesTab>("active");
  const [files, setFiles] = useState<TeamFilePublic[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("size");
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [imageLightbox, setImageLightbox] = useState<{
    attachment: IssueAttachmentPublic;
    imageUrl: string;
  } | null>(null);
  const [videoLightbox, setVideoLightbox] = useState<IssueAttachmentPublic | null>(null);
  const blobCache = useMemo(() => createAttachmentBlobCache(), []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTeamFiles(teamId, { trash: tab === "trash" });
      setFiles(result.files);
      setTotalBytes(result.totalBytes);
    } catch (err) {
      setFiles([]);
      setTotalBytes(0);
      setError(err instanceof Error ? err.message : "Could not load team files");
    } finally {
      setLoading(false);
    }
  }, [teamId, tab]);

  useEffect(() => {
    if (!open) return;
    void loadFiles();
  }, [open, loadFiles]);

  useEffect(() => {
    if (!open) return;
    return () => blobCache.revokeAll();
  }, [blobCache, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let next = files;
    if (q) {
      next = files.filter((file) => {
        const haystack = [
          file.filename,
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
      if (sort === "name") return a.filename.localeCompare(b.filename);
      if (sort === "refs") {
        if (b.linkCount !== a.linkCount) return b.linkCount - a.linkCount;
        return b.sizeBytes - a.sizeBytes;
      }
      if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
      return a.filename.localeCompare(b.filename);
    });
  }, [files, query, sort]);

  if (!open) return null;

  function handleClose() {
    setQuery("");
    setTab("active");
    setImageLightbox(null);
    setVideoLightbox(null);
    blobCache.revokeAll();
    onClose();
  }

  async function softDelete(file: TeamFilePublic) {
    if (!window.confirm(`Move ${file.filename} to trash for ${FILE_TRASH_RETENTION_DAYS} days?`)) {
      return;
    }
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

  async function downloadAttachment(attachment: IssueAttachmentPublic) {
    const blob = await client.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="drawer-backdrop" onClick={handleClose}>
      <aside className="drawer issue-drawer team-files-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="issue-drawer-header">
          <div>
            <p className="eyebrow">Team files</p>
            <h2>File directory</h2>
            <p className="muted team-files-drawer-summary">
              {files.length} file{files.length === 1 ? "" : "s"} · {formatFileSize(totalBytes)} total
              {tab === "trash" ? ` · purged after ${FILE_TRASH_RETENTION_DAYS} days` : ""}
            </p>
          </div>
          <button type="button" className="ghost" onClick={handleClose}>
            Close
          </button>
        </header>

        <div className="team-files-tabs">
          <button
            type="button"
            className={tab === "active" ? "active" : undefined}
            onClick={() => setTab("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={tab === "trash" ? "active" : undefined}
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

        <div className="issue-drawer-body team-files-drawer-body">
          {loading ? (
            <p className="muted">Loading files…</p>
          ) : error ? (
            <p className="issue-link-row-files-error">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="muted">
              {query
                ? "No files match your search."
                : tab === "trash"
                  ? "Trash is empty."
                  : "No files uploaded yet."}
            </p>
          ) : (
            <ul className="team-files-list">
              {filtered.map((file) => (
                <li key={file.fileId} className="team-files-item">
                  <div className="team-files-item-main">
                    <div className="team-files-item-preview-wrap">
                      <TeamFilePreview
                        file={file}
                        blobCache={blobCache}
                        onImageOpen={(attachment, imageUrl) =>
                          setImageLightbox({ attachment, imageUrl })
                        }
                        onVideoOpen={setVideoLightbox}
                      />
                    </div>

                    <div className="team-files-item-center">
                      <div className="team-files-item-title-row">
                        <span className="team-files-item-name" title={file.filename}>
                          {file.filename}
                        </span>
                        <span className="team-files-link-badge">
                          {file.linkCount} link{file.linkCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="team-files-item-description muted" title={fileDescription(file, tab === "trash")}>
                        {fileDescription(file, tab === "trash")}
                      </p>
                      <p className="team-files-item-uploader muted">by {file.uploaderName}</p>
                    </div>

                    <div className="team-files-item-actions">
                      {file.references.length > 0 && onNavigateRef ? (
                        <label className="team-files-ref-select">
                          <span className="sr-only">Jump to linked location for {file.filename}</span>
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
                      ) : null}
                      <FileRefCopyButton fileRef={file.fileRef} filename={file.filename} compact={false} />
                      {tab === "active" ? (
                        <button
                          type="button"
                          className="ghost team-files-delete-btn"
                          disabled={busyFileId === file.fileId}
                          onClick={() => void softDelete(file)}
                        >
                          {busyFileId === file.fileId ? "…" : "Delete"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary compact"
                          disabled={busyFileId === file.fileId}
                          onClick={() => void restore(file)}
                        >
                          {busyFileId === file.fileId ? "…" : "Restore"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

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
    </div>
  );
}
