# File attachments

Files belong to a team. One stored file can be linked to several issues and rows; deleting a link removes the bytes only when nothing links to the file any more. Large files, streaming and chunked uploads: [LARGE-FILES.md](LARGE-FILES.md).

## Where files live

On the server filesystem, not in SQLite:

| What | Path |
|------|------|
| Issue uploads | `data/uploads/<issueId>/` |
| Row (shared) files | `data/uploads/rows/<rowId>/` |
| Chunked uploads in progress | `data/uploads/.tmp/` |

`UPLOAD_DIR` moves the whole tree (relative paths resolve from the repo root). **Back up `data/uploads/` together with `data/teamflow.db`.**

## Limits

Defaults, set in the server environment, restart to apply:

| Type | Default | Env |
|------|---------|-----|
| Images | 4 GB | `ATTACHMENT_MAX_IMAGE_BYTES` |
| Videos | 4 GB | `ATTACHMENT_MAX_VIDEO_BYTES` |
| ZIP archives | 4 GB | `ATTACHMENT_MAX_ZIP_BYTES` |
| Other files | 4 GB | `ATTACHMENT_MAX_BYTES` |

Over the limit the API answers `413 payload_too_large`.

On top of the per-file limits each team is a **space** with an upload cap (free spaces 1 GB by default, admin spaces whatever the admin sets, or none) and the server keeps a free-disk floor (2 GB by default). An upload that would pass the cap is refused before it is written with `413 space_storage_full` (the body adds `usedBytes`, `capBytes`, `fileBytes`, `remainingBytes`); under the floor every upload gets `507 server_storage_low`. Files in the trash count until purged. `GET /teams/:teamId/storage` returns the cap and usage for any member. Details: [SPACES.md](SPACES.md).

## Permissions

Reading files needs team membership. Uploading, linking, moving, renaming, trashing, restoring and deleting forever need `board.edit` (Viewers are read-only; see [AUTH.md](AUTH.md#editing-the-board-boardedit)). A team-scoped PAT only reaches its own team's files.

## Serving

- `GET /attachments/:id/download` sends the file with `Content-Disposition: attachment` and supports `Range`. It takes Bearer auth or `?token=` (below).
- **Browser downloads use a token, not a Blob.** The web app calls `POST /attachments/:id/download-token`, then points a hidden link at the returned `downloadUrl` (`/attachments/:id/download?token=…`). The browser's own download manager fetches the file, so progress shows at once and multi-GB files go straight to disk instead of into the tab's memory. The token is the short-lived stream token (1 hour, bound to that attachment and user); the server rechecks team access on every request. Missing, malformed or expired tokens are `401 unauthorized`; a token for another attachment, or a user who lost team access, is `403 forbidden`.
- `client.downloadAttachment()` (whole file into a Blob) is only for small in-app uses: image thumbnails/lightbox and the team file preview cache.
- **Team bundle export** works the same way: `POST /teams/:teamId/export-token[?includeFiles=true]` returns a `downloadUrl` for `GET /teams/:teamId/export?token=…`. That token has its own audience, lasts 10 minutes, is bound to the team, and the user must still hold `team.data.transfer`. The server streams the zip as it is written (nothing is buffered), so there is no `Content-Length` and no `Range` for exports.
- Files are shown **inline** only when their own bytes are an image, video or PDF (the client-supplied MIME type is not trusted). Everything else, HTML and SVG included, downloads as `application/octet-stream`. Every response carries `X-Content-Type-Options: nosniff`.

## API

Bearer auth on every route, except the `?token=` forms of `download` and `stream`. Full list with permissions: [API.md](API.md#attachments).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/:issueId/attachments` | `{ attachments, limits }` |
| POST | `/issues/:issueId/attachments` | Upload (`multipart/form-data`, field `file`) |
| DELETE | `/issues/:issueId/attachments/:id` | Remove the link (bytes go when no other link remains) |
| POST | `/issues/:issueId/attachments/link` | `{ fileId }`: link an existing team file, no re-upload |
| POST | `/issues/:issueId/attachments/:id/move` | `{ targetIssueId }` on the same team |
| GET | `/rows/:rowId/attachments` | Row shared files + `limits` |
| POST | `/rows/:rowId/attachments` | Upload to a row |
| POST | `/rows/:rowId/attachments/link` | `{ fileId }` |
| DELETE | `/rows/:rowId/attachments/:id` | Remove the row link |
| GET | `/attachments/:id/download` | Download (Range supported); Bearer or `?token=` |
| POST | `/attachments/:id/download-token` | Short-lived token + `downloadUrl` for a browser download (any file type) |
| POST | `/attachments/:id/stream-token` | Short-lived token for `<video src>` |
| GET | `/attachments/:id/stream?token=` | Range-capable stream |

### Upload example

```bash
curl -X POST "https://teamflow.example.com/issues/ISSUE_UUID/attachments" \
  -H "Authorization: Bearer pat_..." \
  -F "file=@screenshot.png"
```

### Response shape

```json
{
  "attachments": [
    {
      "id": "link uuid",
      "issueId": "uuid",
      "fileId": "stored file uuid",
      "fileRef": "file_k3x9q2ab",
      "filename": "screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 12345,
      "kind": "image",
      "uploaderId": "uuid",
      "uploaderName": "Ada",
      "createdAt": "2026-10-22T12:00:00.000Z",
      "downloadUrl": "/attachments/<id>/download",
      "canStream": false
    }
  ],
  "limits": {
    "imageBytes": 4294967296,
    "videoBytes": 4294967296,
    "zipBytes": 4294967296,
    "defaultBytes": 4294967296,
    "chunkBytes": 33554432,
    "chunkThresholdBytes": 8388608
  }
}
```

## Team files and trash

Every file a team uploaded is listed in the **Files** drawer (topbar) and through the API:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teams/:teamId/files` | Active files with `linkCount` and `references` (which issues / rows use each) |
| GET | `/teams/:teamId/files?trash=1` | Files in the trash, with `deletedAt` and `purgeAt` |
| PATCH | `/teams/:teamId/files/:fileId` | Rename (`{ filename }`) |
| DELETE | `/teams/:teamId/files/:fileId` | Move to the trash |
| POST | `/teams/:teamId/files/:fileId/restore` | Restore from the trash |
| DELETE | `/teams/:teamId/files/:fileId/forever` | Delete a trashed file for good: links, row and bytes on disk; returns `{ fileId, freedBytes }`. 400 when the file is not in the trash |

Trashed files are deleted for good after **7 days**; the purge runs when the server starts. **Delete forever** in the Files trash (same `board.edit` permission as trashing, after a confirm) does it at once and frees the space's room straight away. Issues in the issue trash are a separate thing: they are purged after 7 days only by `pnpm db:maintenance` or the nightly flag (see [DEPLOYMENT.md](DEPLOYMENT.md#schema-patches-and-data-maintenance)).

## UI

- **Issue drawer → Attachments:** choose a file or drop it on the zone. Image thumbnails open a lightbox; videos play with seek and speed controls. Large files upload in chunks with progress.
- **Row → Files:** files shared by a whole row; link one into an issue without re-uploading.
- **Files drawer:** every team file, rename, trash, restore and delete forever (trash tab), copy a file ref. A storage meter at the top shows the space's usage against its cap.
- **Upload zones** (issue drawer, row files) say how much room is left from 80% of the cap; when the space or the server disk is full they say so, what still works and how to make room, and Choose file is disabled. A file bigger than what is left is refused before it is sent.
- **Downloads** (file name in the drawers, Download in the Files drawer and lightboxes, Settings → Team → Download bundle): the control shows a spinner and "Starting…" while the token is fetched and the browser takes over, then a toast says "Downloading <name> — progress is in your browser's downloads". If the download cannot start, an error toast offers Retry.

Viewers see all of these read-only.
