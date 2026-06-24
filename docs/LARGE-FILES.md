# Large files — chunked upload, streaming, shared links

Workspace-scale attachments: multi-GB videos (seekable playback), large ZIP downloads, move/link files across issues.

## Chunked upload (resumable)

Files larger than **8 MB** (configurable) upload in **chunks** instead of one POST.

| Setting | Default | Env |
|---------|---------|-----|
| Chunk size | 32 MB | `UPLOAD_CHUNK_BYTES` |
| Chunked threshold | 8 MB | `UPLOAD_CHUNK_THRESHOLD_BYTES` |
| Max video | 4 GB | `ATTACHMENT_MAX_VIDEO_BYTES` |
| Max ZIP | 4 GB | `ATTACHMENT_MAX_ZIP_BYTES` |
| Max image | 25 MB | `ATTACHMENT_MAX_IMAGE_BYTES` |

### How chunks work

A 2 GB video might upload as **~63 chunks of 32 MB** (last chunk smaller). Each chunk is a separate `PUT`; if the connection drops, the client asks `GET /uploads/:sessionId` which chunks already arrived and **only sends the missing ones**. That is the resumable upload feature.

Chunk size is typically **16–64 MB** (we default **32 MB**). Smaller chunks = more requests; larger chunks = harder to retry on failure.

### API flow

1. `POST /issues/:issueId/uploads` — `{ filename, mimeType, totalBytes }` → `{ sessionId, chunkSize, totalChunks, receivedChunks }`
2. `PUT /uploads/:sessionId/chunks/:index` — raw bytes for one chunk
3. `GET /uploads/:sessionId` — resume state
4. `POST /uploads/:sessionId/complete` — assemble file, attach to issue
5. `DELETE /uploads/:sessionId` — abort and delete partial data

Small files still use `POST /issues/:issueId/attachments` (single request).

## Seekable video playback

Videos do **not** load entirely into browser memory. Steps:

1. `POST /attachments/:id/stream-token` (authenticated) → short-lived token
2. `<video src="/attachments/:id/stream?token=...">` — server supports **HTTP Range** (`206 Partial Content`) for seek/scrub

Playback uses native controls (play/pause, volume, fullscreen). Custom UI adds **playback speed** (0.5×–2×).

## Resumable download

`GET /attachments/:id/download` supports `Range` headers so browsers and download managers can resume interrupted downloads.

## Move & link (same file, multiple issues)

Storage is **one file record**, **many issue links**:

- **Move** — `POST /issues/:issueId/attachments/:id/move` `{ targetIssueId }`
- **Link** — `POST /issues/:issueId/attachments/link` `{ fileId }` (from another attachment on a team you can access)

No duplicate bytes on disk when linking.

## Production checklist

- **nginx** `client_max_body_size` ≥ largest chunk (not full 4 GB if using chunked upload)
- **Cloudflare** proxy limits ~100 MB per request — use **grey-cloud DNS** on upload host or direct IP for multi-GB uploads
- **Disk** — plan for `data/uploads/` + `data/uploads/.tmp/` during uploads
- **Backups** — include `data/uploads/`

See also [ATTACHMENTS.md](ATTACHMENTS.md).
