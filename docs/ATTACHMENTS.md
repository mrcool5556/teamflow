# File attachments

Issue-level file uploads (v1). Files are stored on the server filesystem under `data/uploads/`.

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
| GET | `/issues/:issueId/attachments` | List attachments + `limits` object |
| POST | `/issues/:issueId/attachments` | Upload (`multipart/form-data`, field `file`) |
| GET | `/attachments/:id/download` | Download file |
| DELETE | `/issues/:issueId/attachments/:id` | Remove attachment |

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

Attachment metadata loads when you open the issue. **Image previews are not downloaded until you click Preview** (or the filename) — then the full image opens in a lightbox.

## Backups

Include `data/uploads/` when backing up your server — attachments are not stored in SQLite.

## Roadmap

- Paste images in comments and descriptions
- Row-level attachments
- Soft-delete bin (7-day retention)
