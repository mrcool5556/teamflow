import type { AttachmentList } from "../hooks/useAttachmentList";
import { AttachmentLightbox } from "./AttachmentImagePreview";
import { AttachmentVideoLightbox } from "./AttachmentVideoPlayer";

type LightboxState = Pick<
  AttachmentList,
  "imageLightbox" | "videoLightbox" | "closeLightboxes" | "download" | "startingDownloadId"
>;

/** The image and video lightboxes of a useAttachmentList() list. */
export function AttachmentLightboxes({ list }: { list: LightboxState }) {
  const image = list.imageLightbox;
  const video = list.videoLightbox;
  return (
    <>
      {image ? (
        <AttachmentLightbox
          attachment={image.attachment}
          imageUrl={image.imageUrl}
          onClose={list.closeLightboxes}
          onDownload={() => void list.download(image.attachment)}
          downloadStarting={list.startingDownloadId === image.attachment.id}
        />
      ) : null}
      {video ? (
        <AttachmentVideoLightbox
          attachment={video}
          onClose={list.closeLightboxes}
          onDownload={() => void list.download(video)}
          downloadStarting={list.startingDownloadId === video.id}
        />
      ) : null}
    </>
  );
}
