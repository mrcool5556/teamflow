import { useEffect, useRef, useState } from "react";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { client } from "../api";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type AttachmentVideoThumbnailProps = {
  attachment: IssueAttachmentPublic;
  onOpen: () => void;
};

export function AttachmentVideoThumbnail({
  attachment,
  onOpen,
}: AttachmentVideoThumbnailProps) {
  return (
    <button
      type="button"
      className="issue-attachment-thumb issue-attachment-thumb--video"
      onClick={() => onOpen()}
      aria-label={`Play ${attachment.filename}`}
      title="Play video"
    >
      <span className="issue-attachment-video-icon" aria-hidden>
        ▶
      </span>
    </button>
  );
}

type AttachmentVideoLightboxProps = {
  attachment: IssueAttachmentPublic;
  onClose: () => void;
  onDownload: () => void;
};

export function AttachmentVideoLightbox({
  attachment,
  onClose,
  onDownload,
}: AttachmentVideoLightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void client
      .resolveStreamUrl(attachment.id)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed, src]);

  return (
    <div
      className="attachment-lightbox-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <figure
        className="attachment-lightbox attachment-lightbox--video"
        role="dialog"
        aria-label={attachment.filename}
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? (
          <p className="attachment-video-status muted">Loading stream…</p>
        ) : error || !src ? (
          <p className="attachment-video-status">Could not load video stream.</p>
        ) : (
          <video ref={videoRef} src={src} controls playsInline preload="metadata" />
        )}
        <figcaption className="attachment-lightbox-caption">
          <span className="attachment-lightbox-name">{attachment.filename}</span>
          <span className="attachment-lightbox-actions">
            <label className="attachment-video-speed">
              <span className="muted">Speed</span>
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                disabled={!src}
              >
                {PLAYBACK_SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
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

export function isVideoAttachment(attachment: IssueAttachmentPublic) {
  return attachment.kind === "video" || attachment.canStream;
}
