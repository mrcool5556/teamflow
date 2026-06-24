import { useEffect, useState } from "react";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { client } from "../api";

export function isImageAttachment(attachment: IssueAttachmentPublic) {
  if (attachment.mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(attachment.filename);
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

type AttachmentImageThumbnailProps = {
  attachment: IssueAttachmentPublic;
  blobCache: AttachmentBlobCache;
  onOpen: (url: string) => void;
};

export function AttachmentImageThumbnail({
  attachment,
  blobCache,
  onOpen,
}: AttachmentImageThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    void blobCache
      .get(attachment.id)
      .then((objectUrl) => {
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, blobCache]);

  if (failed) return null;

  return (
    <button
      type="button"
      className="issue-attachment-thumb"
      onClick={() => {
        if (url) onOpen(url);
      }}
      disabled={!url}
      aria-label={`Preview ${attachment.filename}`}
      title="Click to enlarge"
    >
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="issue-attachment-thumb-placeholder muted">…</span>
      )}
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
