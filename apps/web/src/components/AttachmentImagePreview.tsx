import { useEffect, useState } from "react";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { isImageAttachmentFile } from "@teamflow/core";
import { client } from "../api";

export function isImageAttachment(attachment: IssueAttachmentPublic) {
  return isImageAttachmentFile(attachment.filename, attachment.mimeType);
}

export type AttachmentBlobCache = {
  get: (attachmentId: string) => Promise<string>;
  revokeAll: () => void;
};

export function createAttachmentBlobCache(): AttachmentBlobCache {
  const map = new Map<string, string>();

  return {
    async get(attachmentId: string) {
      const cached = map.get(attachmentId);
      if (cached) return cached;
      const blob = await client.downloadAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      map.set(attachmentId, url);
      return url;
    },
    revokeAll() {
      for (const url of map.values()) {
        URL.revokeObjectURL(url);
      }
      map.clear();
    },
  };
}

type AttachmentImagePreviewButtonProps = {
  attachment: IssueAttachmentPublic;
  blobCache: AttachmentBlobCache;
  onOpen: (url: string) => void;
};

export function AttachmentImagePreviewButton({
  attachment,
  blobCache,
  onOpen,
}: AttachmentImagePreviewButtonProps) {
  const [loading, setLoading] = useState(false);

  async function openPreview() {
    if (loading) return;
    setLoading(true);
    try {
      const url = await blobCache.get(attachment.id);
      onOpen(url);
    } catch {
      window.alert("Could not load image preview.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="issue-attachment-thumb issue-attachment-thumb--idle"
      onClick={() => void openPreview()}
      disabled={loading}
      aria-label={`Preview ${attachment.filename}`}
      title="Click to load preview"
    >
      <span className="issue-attachment-thumb-label">
        {loading ? "…" : "Preview"}
      </span>
    </button>
  );
}

type AttachmentLightboxProps = {
  attachment: IssueAttachmentPublic;
  imageUrl: string;
  onClose: () => void;
  onDownload: () => void;
};

export function AttachmentLightbox({
  attachment,
  imageUrl,
  onClose,
  onDownload,
}: AttachmentLightboxProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="attachment-lightbox-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <figure
        className="attachment-lightbox"
        role="dialog"
        aria-label={attachment.filename}
        onClick={(event) => event.stopPropagation()}
      >
        <img src={imageUrl} alt={attachment.filename} />
        <figcaption className="attachment-lightbox-caption">
          <span className="attachment-lightbox-name">{attachment.filename}</span>
          <span className="attachment-lightbox-actions">
            <button type="button" className="ghost" onClick={onDownload}>
              Download
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
