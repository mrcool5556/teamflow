# File attachments

Issue and row file uploads. Files are stored on the server filesystem under `data/uploads/` (`issues/{issueId}/` or `rows/{rowId}/`).

## Limits

Defaults (override in `.env`, then restart):

| Type | Default | Env |
|------|---------|-----|
| Images | 25 MB | `ATTACHMENT_MAX_IMAGE_BYTES` |
| ZIP archives | 150 MB | `ATTACHMENT_MAX_ZIP_BYTES` |
| Other files | 25 MB | `ATTACHMENT_MAX_BYTES` |
| Storage directory | `data/uploads/` | `UPLOAD_DIR` (optional absolute path) |

Example:

```bash
ATTACHMENT_MAX_IMAGE_BYTES=26214400
ATTACHMENT_MAX_ZIP_BYTES=157286400
```

## API

Auth required for all routes.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/:issueId/attachments` | List issue attachments + `limits` object |
| POST | `/issues/:issueId/attachments` | Upload to issue (`multipart/form-data`, field `file`) |
| GET | `/rows/:rowId/attachments` | List row shared files + `limits` |
| POST | `/rows/:rowId/attachments` | Upload to row (`multipart/form-data`, field `file`) |
| GET | `/attachments/:id/download` | Download file |
| DELETE | `/issues/:issueId/attachments/:id` | Remove issue attachment |
| DELETE | `/rows/:rowId/attachments/:id` | Remove row file |

### Upload example

```bash
curl -X POST "https://teamflow.example.com/issues/ISSUE_UUID/attachments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@screenshot.png"
```

### Response shape

```json
{
  "attachments": [
    {
      "id": "uuid",
      "issueId": "uuid",
      "filename": "screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 12345,
      "uploaderId": "uuid",
      "uploaderName": "Demo User",
      "createdAt": "2026-06-21T12:00:00.000Z",
      "downloadUrl": "/attachments/uuid/download"
    }
  ],
  "limits": {
    "imageBytes": 26214400,
    "zipBytes": 157286400,
    "defaultBytes": 26214400
  }
}
```

## UI

Open an issue → **Attachments** section → choose file or drag onto the drop zone.

Attachment metadata loads when you open the issue. Image thumbnails load then too; click a thumbnail or filename to open the full-size lightbox.

## Backups

Include `data/uploads/` when backing up your server — attachments are not stored in SQLite.

## Roadmap

See **Plan → Filesystem — suggested build order** in the app for the full ordered backlog. Summary:

1. Link row file to issue (no re-upload) — **done**
2. Move attachment between issues (UI for existing API)
3. Paste images in comments
4. File soft-delete bin (7-day retention)
5. Resume / cancel chunked uploads in UI
6. File count badge on row **Files** button
7. Cross-link indicators (also on row X / issue Y)
8. Team-wide file area
9. Folders / directory tree

Also planned: paste images in descriptions.

**Done:** issue uploads, row shared files drawer, chunked upload + seekable video (server).
