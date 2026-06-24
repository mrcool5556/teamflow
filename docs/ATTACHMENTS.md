# File attachments

Issue-level file uploads (v1). Files are stored on the server filesystem under `data/uploads/`.

## Limits

| Setting | Default | Env |
|---------|---------|-----|
| Max file size | 10 MB | `ATTACHMENT_MAX_BYTES` |
| Storage directory | `data/uploads/` | `UPLOAD_DIR` (optional absolute path) |

## API

Auth required for all routes.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/:issueId/attachments` | List attachments on an issue |
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
  "attachment": {
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
}
```

## UI

Open an issue → **Attachments** section → choose file or drag onto the drop zone.

## Backups

Include `data/uploads/` when backing up your server — attachments are not stored in SQLite.

## Roadmap

- Paste images in comments and descriptions
- Row-level attachments
- Soft-delete bin (7-day retention)
