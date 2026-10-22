import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { INLINE_MIME_TYPES, sniffFileInlineMimeType } from "./httpHardening.js";

export function parseByteRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const [startStr, endStr] = rangeHeader.slice(6).split("-");
  let start = startStr ? Number.parseInt(startStr, 10) : 0;
  let end = endStr ? Number.parseInt(endStr, 10) : size - 1;
  if (Number.isNaN(start) || start < 0) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
}

function contentDisposition(filename: string, inline: boolean) {
  const encodedName = encodeURIComponent(filename);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`;
}

export async function createFileRangeResponse(
  fullPath: string,
  options: {
    mimeType: string;
    filename: string;
    inline: boolean;
    rangeHeader?: string;
  },
): Promise<Response> {
  const fileStat = await stat(fullPath);
  const size = fileStat.size;

  // Inline rendering is only allowed for a small allowlist of types, and the type is taken
  // from the file's own bytes, never from the uploader-supplied MIME. Everything else is a
  // download served as application/octet-stream (plus the global nosniff header).
  let inline = false;
  let contentType = options.mimeType;
  if (options.inline) {
    const sniffed = await sniffFileInlineMimeType(fullPath).catch(() => null);
    if (sniffed && INLINE_MIME_TYPES.has(sniffed)) {
      inline = true;
      contentType = sniffed;
    } else {
      contentType = "application/octet-stream";
    }
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(options.filename, inline),
    "X-Content-Type-Options": "nosniff",
  };

  const range = parseByteRange(options.rangeHeader, size);
  if (!range) {
    const stream = createReadStream(fullPath);
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const { start, end } = range;
  const chunkSize = end - start + 1;
  const stream = createReadStream(fullPath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}
