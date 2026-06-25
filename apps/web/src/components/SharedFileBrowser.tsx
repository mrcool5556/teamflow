import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { FileRefCopyButton } from "./FileRefCopyButton";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type SharedFileBrowserProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  files: IssueAttachmentPublic[];
  loading?: boolean;
  linkedFileIds?: ReadonlySet<string>;
  linkingFileId?: string | null;
  onClose: () => void;
  onLink?: (file: IssueAttachmentPublic) => void;
};

export function SharedFileBrowser({
  open,
  title,
  subtitle,
  files,
  loading = false,
  linkedFileIds,
  linkingFileId = null,
  onClose,
  onLink,
}: SharedFileBrowserProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) => {
      const hay = `${file.filename} ${file.fileRef} ${file.uploaderName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [files, query]);

  if (!open) return null;

  return createPortal(
    <div className="shared-file-browser-backdrop" onClick={onClose}>
      <aside className="shared-file-browser" onClick={(e) => e.stopPropagation()}>
        <header className="shared-file-browser-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="shared-file-browser-search">
          <input
            type="search"
            value={query}
            placeholder="Search files…"
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="shared-file-browser-body">
          {loading ? (
            <p className="muted">Loading files…</p>
          ) : files.length === 0 ? (
            <p className="muted">No files here yet.</p>
          ) : filtered.length === 0 ? (
            <p className="muted">No files match your search.</p>
          ) : (
            <ul className="shared-file-browser-list">
              {filtered.map((file) => {
                const alreadyLinked = linkedFileIds?.has(file.fileId) ?? false;
                return (
                  <li key={file.fileId} className="shared-file-browser-item">
                    <div className="shared-file-browser-meta">
                      <span className="shared-file-browser-name">{file.filename}</span>
                      <span className="shared-file-browser-sub muted">
                        {file.fileRef} · {formatFileSize(file.sizeBytes)} · {file.uploaderName}
                      </span>
                    </div>
                    <div className="shared-file-browser-actions">
                      <FileRefCopyButton fileRef={file.fileRef} filename={file.filename} />
                      {onLink ? (
                        <button
                          type="button"
                          className="secondary compact"
                          disabled={alreadyLinked || linkingFileId === file.fileId}
                          onClick={() => onLink(file)}
                        >
                          {alreadyLinked
                            ? "Linked"
                            : linkingFileId === file.fileId
                              ? "Linking…"
                              : "Link"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
