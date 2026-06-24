import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

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
  const baseHeaders: Record<string, string> = {
    "Content-Type": options.mimeType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(options.filename, options.inline),
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
