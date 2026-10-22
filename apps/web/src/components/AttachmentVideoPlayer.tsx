import { useCallback, useEffect, useRef, useState } from "react";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { client } from "../api";
import { Dialog } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const MEDIA_SESSION_ACTIONS = [
  "play",
  "pause",
  "seekbackward",
  "seekforward",
  "previoustrack",
  "nexttrack",
  "stop",
] as const;

function releaseVideoElement(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function clearMediaSession() {
  if (!("mediaSession" in navigator)) return;
  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Some actions are unsupported in certain browsers.
    }
  }
  navigator.mediaSession.playbackState = "none";
  navigator.mediaSession.metadata = null;
}

type AttachmentVideoThumbnailProps = {
  attachment: IssueAttachmentPublic;
  onOpen: () => void;
};

export function AttachmentVideoThumbnail({ attachment, onOpen }: AttachmentVideoThumbnailProps) {
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
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState(1);

  const releasePlayback = useCallback(() => {
    releaseVideoElement(videoElementRef.current);
    clearMediaSession();
  }, []);

  const handleClose = useCallback(() => {
    releasePlayback();
    onClose();
  }, [onClose, releasePlayback]);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (!node && videoElementRef.current) {
      releaseVideoElement(videoElementRef.current);
    }
    videoElementRef.current = node;
  }, []);

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
    return () => {
      releasePlayback();
    };
  }, [releasePlayback]);

  useEffect(() => {
    if (videoElementRef.current) {
      videoElementRef.current.playbackRate = speed;
    }
  }, [speed, src]);

  return (
    <Dialog
      onClose={handleClose}
      backdropClassName="attachment-lightbox-backdrop"
      className="attachment-lightbox attachment-lightbox--video"
      as="figure"
    >
      {loading ? (
        <p className="attachment-video-status muted">Loading stream…</p>
      ) : error || !src ? (
        <p className="attachment-video-status">Could not load video stream.</p>
      ) : (
        <video
          ref={setVideoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          disableRemotePlayback
        />
      )}
      <figcaption className="attachment-lightbox-caption">
        <DialogTitle as="span" className="attachment-lightbox-name">
          {attachment.filename}
        </DialogTitle>
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
          <button type="button" className="ghost" onClick={handleClose}>
            Close
          </button>
        </span>
      </figcaption>
    </Dialog>
  );
}

export function isVideoAttachment(attachment: IssueAttachmentPublic) {
  return attachment.kind === "video" || attachment.canStream;
}
