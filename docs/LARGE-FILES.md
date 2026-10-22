# Large files: chunked upload, streaming, shared links

Multi-GB videos with seekable playback, large ZIP downloads, and one file linked to many issues. Basics (limits, storage, permissions): [ATTACHMENTS.md](ATTACHMENTS.md).

## Chunked upload (resumable)

Files larger than **8 MB** upload in chunks instead of one POST. The web app does this automatically.

| Setting | Default | Env |
|---------|---------|-----|
| Chunk size | 32 MB | `UPLOAD_CHUNK_BYTES` |
| Chunked threshold | 8 MB | `UPLOAD_CHUNK_THRESHOLD_BYTES` |
| Max video / ZIP / image / other | 4 GB each | `ATTACHMENT_MAX_VIDEO_BYTES`, `ATTACHMENT_MAX_ZIP_BYTES`, `ATTACHMENT_MAX_IMAGE_BYTES`, `ATTACHMENT_MAX_BYTES` |

A 2 GB video uploads as about 63 chunks of 32 MB. Each chunk is a separate `PUT`; after a dropped connection the client asks `GET /uploads/:sessionId` which chunks arrived and sends only the missing ones.

### API flow

1. `POST /issues/:issueId/uploads` (or `POST /rows/:rowId/uploads`) with `{ filename, mimeType, totalBytes }` → `{ sessionId, chunkSize, totalChunks, receivedChunks }`
2. `PUT /uploads/:sessionId/chunks/:index`: raw bytes of one chunk
3. `GET /uploads/:sessionId`: resume state
4. `POST /uploads/:sessionId/complete`: assemble the file and attach it
5. `DELETE /uploads/:sessionId`: abort and delete the partial data

Rules:

- All steps need `board.edit` on the team; only the user who started a session can send its chunks or complete it.
- Partial data sits in `data/uploads/.tmp/`. Sessions expire after **48 hours**; expired ones are cleaned up when the server starts.
- Small files still use `POST /issues/:issueId/attachments` (one request).

## Seekable video playback

Videos are not loaded whole into browser memory:

1. `POST /attachments/:id/stream-token` (Bearer auth) → a token valid for one hour
2. `<video src="/attachments/:id/stream?token=...">`: the server answers HTTP Range requests (`206 Partial Content`), so seeking works

The player uses native controls plus a playback-speed menu (0.5× to 2×).

## Resumable download

`GET /attachments/:id/download` supports `Range`, so browsers and download managers can resume.

## Move and link (one file, many issues)

Storage is one file record with many links:

- **Move:** `POST /issues/:issueId/attachments/:id/move` with `{ targetIssueId }` (same team)
- **Link:** `POST /issues/:issueId/attachments/link` or `POST /rows/:rowId/attachments/link` with `{ fileId }` (a file of the same team)

Linking never copies bytes. Removing a link deletes the bytes only when nothing else links to the file; the **Files** drawer trash keeps a file for 7 days (see [ATTACHMENTS.md](ATTACHMENTS.md#team-files-and-trash)).

## Production checklist

- **Reverse proxy body size:** nginx `client_max_body_size` (or equivalent) at least one chunk (32 MB) plus headers; the full 4 GB is not needed with chunked upload.
- **Cloudflare proxy** limits a request to about 100 MB on free plans; chunks fit, single large posts do not.
- **Disk:** room for `data/uploads/` plus `data/uploads/.tmp/` during uploads.
- **Backups:** include `data/uploads/`. `sudo teamflow-backup` (full) does; `--db-only` and the pre-update backup do not.
