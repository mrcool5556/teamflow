import { useEffect, useState } from "react";
import type { IssueAttachmentPublic, TeamFilePublic } from "@teamflow/core";
import {
  attachmentFileKind,
  isImageAttachmentFile,
  isVideoAttachmentFile,
  isZipAttachmentFile,
} from "@teamflow/core";
import type { TeamFilePreviewCache } from "../lib/teamFilePreviewCache";
import { AttachmentVideoThumbnail } from "./AttachmentVideoPlayer";

function filePreviewAttachment(file: TeamFilePublic): IssueAttachmentPublic | null {
  const link = file.references[0];
  if (!link) return null;

  return {
    id: link.linkId,
    issueId: link.kind === "issue" ? link.linkId : null,
    rowId: link.kind === "row" ? link.linkId : null,
    fileId: file.fileId,
    fileRef: file.fileRef,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    kind: file.kind,
    uploaderId: file.uploaderId,
    uploaderName: file.uploaderName,
    createdAt: file.createdAt,
    downloadUrl: `/attachments/${link.linkId}/download`,
    canStream: isVideoAttachmentFile(file.filename, file.mimeType),
  };
}

function kindLabel(kind: ReturnType<typeof attachmentFileKind>) {
  if (kind === "image") return "IMG";
  if (kind === "video") return "VID";
  if (kind === "zip") return "ZIP";
  return "FILE";
}

type TeamFilePreviewProps = {
  file: TeamFilePublic;
  previewCache: TeamFilePreviewCache;
  onImageOpen?: (attachment: IssueAttachmentPublic, url: string) => void;
  onVideoOpen?: (attachment: IssueAttachmentPublic) => void;
};

function TeamFileImageThumbnail({
  file,
  attachment,
  previewCache,
  onOpen,
}: {
  file: TeamFilePublic;
  attachment: IssueAttachmentPublic;
  previewCache: TeamFilePreviewCache;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    void previewCache
      .getThumbnail(file.fileId, attachment.id)
      .then((objectUrl) => {
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, file.fileId, previewCache]);

  if (failed) {
    return <TeamFileKindPlaceholder file={file} />;
  }

  return (
    <button
      type="button"
      className="issue-attachment-thumb team-files-preview-thumb"
      onClick={() => {
        void previewCache.getFull(file.fileId, attachment.id).then(onOpen);
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

export function TeamFilePreview({
  file,
  previewCache,
  onImageOpen,
  onVideoOpen,
}: TeamFilePreviewProps) {
  const attachment = filePreviewAttachment(file);
  const isImage = isImageAttachmentFile(file.filename, file.mimeType);
  const isVideo = isVideoAttachmentFile(file.filename, file.mimeType);

  if (attachment && isImage && onImageOpen) {
    return (
      <TeamFileImageThumbnail
        file={file}
        attachment={attachment}
        previewCache={previewCache}
        onOpen={(url) => onImageOpen(attachment, url)}
      />
    );
  }

  if (attachment && isVideo && onVideoOpen) {
    return (
      <AttachmentVideoThumbnail attachment={attachment} onOpen={() => onVideoOpen(attachment)} />
    );
  }

  return <TeamFileKindPlaceholder file={file} />;
}

function TeamFileKindPlaceholder({ file }: { file: TeamFilePublic }) {
  const kind = attachmentFileKind(file.filename, file.mimeType);

  return (
    <div
      className={`team-files-preview team-files-preview--placeholder ${isZipAttachmentFile(file.filename, file.mimeType) ? "team-files-preview--zip" : ""}`}
      aria-hidden
    >
      <span className="team-files-preview-kind">{kindLabel(kind)}</span>
    </div>
  );
}

export { filePreviewAttachment };
