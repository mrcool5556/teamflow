import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttachmentLimitsPublic, IssueAttachmentPublic } from "@teamflow/core";
import {
  DEFAULT_ATTACHMENT_LIMITS,
  isImageAttachmentFile,
  maxBytesForAttachmentFile,
} from "@teamflow/core";
import { client } from "../api";
import { createAttachmentBlobCache, isImageAttachment } from "../components/AttachmentImagePreview";
import { isVideoAttachment } from "../components/AttachmentVideoPlayer";
import { downloadAttachmentFile } from "../lib/download";
import { useErrorSink } from "../lib/errorSink";
import { formatFileSize } from "../lib/format";
import { queryKeys } from "../queries/keys";
import { useConfirm } from "../ui/confirmContext";

/** Whose attachments: an issue's own files or a row's shared files. */
export type AttachmentOwner = { kind: "issue"; id: string } | { kind: "row"; id: string };

type AttachmentListData = { attachments: IssueAttachmentPublic[]; limits: AttachmentLimitsPublic };

export type ImageLightbox = { attachment: IssueAttachmentPublic; imageUrl: string };

const NO_ATTACHMENTS: IssueAttachmentPublic[] = [];

function ownerApi(owner: AttachmentOwner) {
  return owner.kind === "issue"
    ? {
        key: queryKeys.issueAttachments(owner.id),
        list: (signal: AbortSignal) => client.withSignal(signal).listAttachments(owner.id),
        upload: (file: File, options: Parameters<typeof client.uploadFile>[2]) =>
          client.uploadFile(owner.id, file, options),
        remove: (attachmentId: string) => client.deleteAttachment(owner.id, attachmentId),
      }
    : {
        key: queryKeys.rowAttachments(owner.id),
        list: (signal: AbortSignal) => client.withSignal(signal).listRowAttachments(owner.id),
        upload: (file: File, options: Parameters<typeof client.uploadRowFile>[2]) =>
          client.uploadRowFile(owner.id, file, options),
        remove: (attachmentId: string) => client.deleteRowAttachment(owner.id, attachmentId),
      };
}

/**
 * Everything an attachment list needs: the cached list and limits, upload (the api client
 * chunks large files) with progress, download, confirmed removal, linking, the drop zone, and
 * image/video lightbox state. Used by the issue drawer and the row files drawer.
 */
export function useAttachmentList(
  owner: AttachmentOwner,
  { sizeDigits }: { sizeDigits?: number } = {},
) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { report, show } = useErrorSink();
  const api = ownerApi(owner);

  const query = useQuery({
    queryKey: api.key,
    queryFn: ({ signal }) => api.list(signal),
  });
  const attachments = query.data?.attachments ?? NO_ATTACHMENTS;
  const limits = query.data?.limits ?? DEFAULT_ATTACHMENT_LIMITS;

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Lightbox state remembers its owner, so moving to another issue hides a stale preview.
  const ownerKey = `${owner.kind}:${owner.id}`;
  const [lightbox, setLightbox] = useState<{
    ownerKey: string;
    image?: ImageLightbox;
    video?: IssueAttachmentPublic;
  } | null>(null);
  const shown = lightbox?.ownerKey === ownerKey ? lightbox : null;
  const imageLightbox = shown?.image ?? null;
  const videoLightbox = shown?.video ?? null;
  const setImageLightbox = (image: ImageLightbox) => setLightbox({ ownerKey, image });
  const setVideoLightbox = (video: IssueAttachmentPublic) => setLightbox({ ownerKey, video });
  const blobCache = useMemo(() => createAttachmentBlobCache(), []);
  const [input, setInput] = useState<HTMLInputElement | null>(null);

  // A different owner (the drawer moved to another issue) starts with a clean preview cache.
  useEffect(() => {
    blobCache.revokeAll();
    return () => blobCache.revokeAll();
  }, [ownerKey, blobCache]);

  const linkedFileIds = useMemo(
    () => new Set(attachments.map((attachment) => attachment.fileId)),
    [attachments],
  );

  function update(change: (prev: IssueAttachmentPublic[]) => IssueAttachmentPublic[]) {
    queryClient.setQueryData<AttachmentListData>(api.key, (data) =>
      data ? { ...data, attachments: change(data.attachments) } : data,
    );
  }

  /** Add an attachment linked from elsewhere (skips files already in the list). */
  function addLinked(attachment: IssueAttachmentPublic) {
    update((prev) =>
      prev.some((item) => item.fileId === attachment.fileId) ? prev : [...prev, attachment],
    );
  }

  async function upload(file: File) {
    if (uploading) return;
    const maxBytes = maxBytesForAttachmentFile(
      file.name,
      file.type || "application/octet-stream",
      limits,
    );
    if (file.size > maxBytes) {
      show(
        `File is too large (${formatFileSize(file.size, sizeDigits)}). Max for this type is ${formatFileSize(maxBytes, sizeDigits)}.`,
      );
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadName(file.name);
    try {
      const { attachment } = await api.upload(file, {
        limits,
        onProgress: (percent: number) => setUploadProgress(percent),
      });
      update((prev) => [...prev, attachment]);
      if (isImageAttachmentFile(file.name, file.type || "")) {
        blobCache.set(attachment.id, URL.createObjectURL(file));
      }
    } catch (error) {
      report(error, "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadName(null);
    }
  }

  async function download(attachment: IssueAttachmentPublic) {
    try {
      await downloadAttachmentFile(attachment.id, attachment.filename);
    } catch (error) {
      report(error, "Download failed");
    }
  }

  async function remove(attachment: IssueAttachmentPublic) {
    const ok = await confirm({
      title: `Remove ${attachment.filename}?`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(attachment.id);
    try {
      await api.remove(attachment.id);
      update((prev) => prev.filter((item) => item.id !== attachment.id));
    } catch (error) {
      report(error, "Could not remove the file");
    } finally {
      setDeletingId(null);
    }
  }

  async function openImage(attachment: IssueAttachmentPublic) {
    try {
      const imageUrl = await blobCache.get(attachment.id);
      setImageLightbox({ attachment, imageUrl });
    } catch {
      show("Could not load image preview.");
    }
  }

  /** Videos and images open in a lightbox; anything else downloads. */
  function open(attachment: IssueAttachmentPublic) {
    if (isVideoAttachment(attachment)) setVideoLightbox(attachment);
    else if (isImageAttachment(attachment)) void openImage(attachment);
    else void download(attachment);
  }

  function closeLightboxes() {
    setLightbox(null);
  }

  /** Call when the drawer closes: drops previews and their object URLs. */
  function release() {
    closeLightboxes();
    blobCache.revokeAll();
  }

  const dropZoneProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
  };

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  }

  return {
    attachments,
    loading: query.isPending,
    limits,
    linkedFileIds,
    uploading,
    uploadProgress,
    uploadName,
    deletingId,
    dragOver,
    dropZoneProps,
    /** Callback ref for the hidden file input. */
    bindFileInput: setInput,
    onInputChange,
    chooseFile: () => input?.click(),
    upload,
    download,
    remove,
    addLinked,
    open,
    openVideo: setVideoLightbox,
    openImageUrl: (attachment: IssueAttachmentPublic, imageUrl: string) =>
      setImageLightbox({ attachment, imageUrl }),
    imageLightbox,
    videoLightbox,
    closeLightboxes,
    blobCache,
    release,
  };
}

export type AttachmentList = ReturnType<typeof useAttachmentList>;
