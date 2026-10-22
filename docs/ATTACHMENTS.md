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

## Permissions

Reading files needs team membership. Uploading, linking, moving, renaming, trashing and restoring need `board.edit` (Viewers are read-only; see [AUTH.md](AUTH.md#editing-the-board-boardedit)). A team-scoped PAT only reaches its own team's files.

## Serving

- `GET /attachments/:id/download` sends the file with `Content-Disposition` and supports `Range`.
- Files are shown **inline** only when their own bytes are an image, video or PDF (the client-supplied MIME type is not trusted). Everything else, HTML and SVG included, downloads as `application/octet-stream`. Every response carries `X-Content-Type-Options: nosniff`.

## API

Bearer auth on every route. Full list with permissions: [API.md](API.md#attachments).

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
| GET | `/attachments/:id/download` | Download (Range supported) |
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

Trashed files are deleted for good after **7 days**; the purge runs when the server starts. Issues in the issue trash are a separate thing: they are purged after 7 days only by `pnpm db:maintenance` or the nightly flag (see [DEPLOYMENT.md](DEPLOYMENT.md#schema-patches-and-data-maintenance)).

## UI

- **Issue drawer → Attachments:** choose a file or drop it on the zone. Image thumbnails open a lightbox; videos play with seek and speed controls. Large files upload in chunks with progress.
- **Row → Files:** files shared by a whole row; link one into an issue without re-uploading.
- **Files drawer:** every team file, rename, trash and restore, copy a file ref.

Viewers see all of these read-only.
