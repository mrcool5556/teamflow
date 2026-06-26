import type { IssueAttachmentPublic, TeamFilePublic } from "@teamflow/core";
import {
  attachmentFileKind,
  isImageAttachmentFile,
  isVideoAttachmentFile,
} from "@teamflow/core";
import type { AttachmentBlobCache } from "./AttachmentImagePreview";
import { AttachmentImageThumbnail } from "./AttachmentImagePreview";
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
  blobCache: AttachmentBlobCache;
  onImageOpen?: (attachment: IssueAttachmentPublic, url: string) => void;
  onVideoOpen?: (attachment: IssueAttachmentPublic) => void;
};

export function TeamFilePreview({
  file,
  blobCache,
  onImageOpen,
  onVideoOpen,
}: TeamFilePreviewProps) {
  const attachment = filePreviewAttachment(file);
  const isImage = isImageAttachmentFile(file.filename, file.mimeType);
  const isVideo = isVideoAttachmentFile(file.filename, file.mimeType);

  if (attachment && isImage && onImageOpen) {
    return (
      <AttachmentImageThumbnail
        attachment={attachment}
        blobCache={blobCache}
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
    <div className="team-files-preview team-files-preview--placeholder" aria-hidden>
      <span className="team-files-preview-kind">{kindLabel(kind)}</span>
    </div>
  );
}
