import { useEffect, useMemo, useState } from "react";
import type { TeamFilePublic } from "@teamflow/core";
import { client } from "../api";
import { FileRefCopyButton } from "./FileRefCopyButton";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type TeamFilesDrawerProps = {
  teamId: string;
  open: boolean;
  onClose: () => void;
  onNavigateRef?: (ref: string) => void;
};

type SortMode = "size" | "name" | "refs";

export function TeamFilesDrawer({
  teamId,
  open,
  onClose,
  onNavigateRef,
}: TeamFilesDrawerProps) {
  const [files, setFiles] = useState<TeamFilePublic[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("size");
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void client
      .listTeamFiles(teamId)
      .then((result) => {
        if (cancelled) return;
        setFiles(result.files);
        setTotalBytes(result.totalBytes);
      })
      .catch((err) => {
        if (!cancelled) {
          setFiles([]);
          setTotalBytes(0);
          setError(err instanceof Error ? err.message : "Could not load team files");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

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
    setExpandedFileId(null);
    onClose();
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
            </p>
          </div>
          <button type="button" className="ghost" onClick={handleClose}>
            Close
          </button>
        </header>

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
            <p className="muted">{query ? "No files match your search." : "No files uploaded yet."}</p>
          ) : (
            <ul className="team-files-list">
              {filtered.map((file) => {
                const expanded = expandedFileId === file.fileId;
                return (
                  <li key={file.fileId} className="team-files-item">
                    <div className="team-files-item-main">
                      <button
                        type="button"
                        className="team-files-item-toggle"
                        onClick={() =>
                          setExpandedFileId((current) =>
                            current === file.fileId ? null : file.fileId,
                          )
                        }
                      >
                        <span className="team-files-item-name">{file.filename}</span>
                        <span className="team-files-item-meta muted">
                          {file.fileRef} · {formatFileSize(file.sizeBytes)} · {file.linkCount} link
                          {file.linkCount === 1 ? "" : "s"}
                        </span>
                      </button>
                      <div className="team-files-item-actions">
                        <FileRefCopyButton fileRef={file.fileRef} filename={file.filename} />
                      </div>
                    </div>
                    {expanded ? (
                      <div className="team-files-item-refs">
                        <p className="muted team-files-item-refs-label">
                          Linked on · uploaded by {file.uploaderName}
                        </p>
                        <ul className="team-files-ref-list">
                          {file.references.map((ref) => (
                            <li key={`${ref.kind}-${ref.linkId}`}>
                              {onNavigateRef ? (
                                <button
                                  type="button"
                                  className="team-files-ref-link"
                                  onClick={() => onNavigateRef(ref.ref)}
                                >
                                  <span className="team-files-ref-kind">
                                    {ref.kind === "issue" ? "Issue" : "Row"}
                                  </span>
                                  <span className="team-files-ref-id">{ref.ref}</span>
                                  <span className="muted team-files-ref-name">{ref.name}</span>
                                </button>
                              ) : (
                                <span className="team-files-ref-static">
                                  <span className="team-files-ref-kind">
                                    {ref.kind === "issue" ? "Issue" : "Row"}
                                  </span>
                                  <span className="team-files-ref-id">{ref.ref}</span>
                                  <span className="muted team-files-ref-name">{ref.name}</span>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
