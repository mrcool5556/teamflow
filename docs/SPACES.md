# Spaces and the server admin page

Every team is a **space**: a team plus an upload allowance. Spaces keep the server's disk from
filling up without limiting how people work: issues, comments, rows and links are never capped,
only uploaded bytes are. Design and mock-up: [mockups/admin-spaces-v1.html](mockups/admin-spaces-v1.html).

## The two kinds

| | Admin space | Free space |
|---|---|---|
| Made by | An instance admin (Server admin → Spaces → New space, or New team) | Any user (New team), and each new user's **General** |
| Upload cap | Whatever the admin sets, or no limit | The free-space cap (default **1 GB**) |
| Per-user limit | None | At most **3** per user (their General counts) |

- The space counts against `teams.space_owner_id`, the account it was made for. Instance admins
  (including accounts in `TEAMFLOW_INSTANCE_ADMINS`) always make admin spaces with no limit.
- A fourth free space is refused with `409 free_space_limit` (`owned`, `limit` in the body).
  Deleting one frees a slot. Registration is never refused, even with a limit of 0. An admin can
  make free spaces for a user past the limit.
- Teams that existed before spaces (schema version 4) became **admin spaces with no limit**, so
  nothing changed for them until an admin sets a cap.

## What counts against the cap

The bytes a space keeps on disk:

- each stored file once, however many issues and rows link it (`stored_files.team_id`);
- files in the **Files trash**, until they are purged after 7 days;
- files on issues in the **issue trash**;
- **chunked uploads in progress**, at their full size from the moment they start, so two large
  uploads cannot both squeeze into the same room.

Not counted: the database, backups and team bundle exports (server-level, shown on the admin
Overview under Disk).

Removing a file from its last issue or row deletes it at once and frees the room. Moving a file
to the trash does not free room until it is purged, so the Files trash has **Delete forever**:
anyone who may move the file to the trash (`board.edit`) can delete it for good after a confirm
that says how much it frees, and the usage drops at once (`DELETE /teams/:teamId/files/:fileId/forever`,
recorded in the space's history). An admin can also empty a space's whole trash.

## Near and at the limit

- **From 80%:** the Files drawer meter turns amber, and the issue and row upload zones say how
  much is left.
- **At the cap, or when a file would not fit:** the upload is refused before any bytes are
  sent. The upload zone says the space is full, what still works and how to make room, and
  Choose file is disabled. Issues, comments, moving files and linking existing files keep
  working.
- **Server free-disk floor:** while the upload disk has less than the floor free (default
  **2 GB**), every upload in every space is refused, capped or not, with its own message.

The server checks every upload path (direct issue and row uploads, chunked sessions at start and
again at complete, team bundle imports with files). Linking and moving never add bytes and are
limited to the same space. A refused chunked upload keeps its session, so it can complete once
there is room.

| Status | `code` | Body extras |
|---|---|---|
| 413 | `space_storage_full` | `usedBytes`, `capBytes`, `fileBytes`, `remainingBytes` |
| 507 | `server_storage_low` | — |
| 409 | `free_space_limit` | `owned`, `limit` |

## Changing a space

Server admin → Spaces → a space:

- **Cap:** any size in GB, or no limit. Lowering it under current use deletes nothing; it only
  blocks new uploads until files are removed.
- **Type:** admin ↔ free. Free → admin stops it counting toward the owner's free spaces. An
  admin space with no limit turned free gets the free-space cap unless a cap is given.
- **Empty trash now** and **Cancel uploads in progress** free room at once.

Every change is recorded in the space's history (`space_events`).

## Settings

Server admin → Space defaults, or the environment (the page's values win once saved):

| Setting | Env | Default |
|---|---|---|
| Free-space cap | `TEAMFLOW_FREE_SPACE_CAP_BYTES` | 1073741824 (1 GB) |
| Free spaces per user | `TEAMFLOW_FREE_SPACES_PER_USER` | 3 |
| Keep this much disk free | `TEAMFLOW_MIN_FREE_DISK_BYTES` | 2147483648 (2 GB); 0 turns it off |

They apply to new spaces only; existing caps stay. The page stores them in `instance_settings`.

## The server admin page

Instance admins open it from the account menu (**Server admin**) at `/t/<team>/admin` (or
`/admin`). It keeps the current team so the existing update and bot panels can run.

- **Overview:** the server (version, Node, uptime, listen address and port, `PUBLIC_URL`, systemd
  or Docker as seen from the process, and a **Check public URL** button that fetches
  `PUBLIC_URL/health` from the server), the Discord bot service, updates, backups, disk (statfs on
  the upload folder: uploads, database, backups and the rest, caps allocated, the floor), space
  counts and **common fixes** worked out from those checks. Anything that needs more host access
  than the process has says "not detectable" or "not available" and links a how-to.
- **Spaces**, **Space detail**, **Space defaults:** above.
- **Updates & backups** and **Discord bot:** the Settings panels, through the current team.
- **How-tos & fixes:** step-by-step commands (LXC first, Windows where it differs); the ones
  matching the Overview's findings are listed first.

## API

Instance admin only, no team needed (full list in [API.md](API.md#instance-admin-and-spaces)):

| Method | Path | |
|---|---|---|
| GET | `/instance/overview` | Server, disk, bot, maintenance, space counts, settings, fixes |
| GET | `/instance/checks/public-url` | Fetch `PUBLIC_URL/health` (5 s timeout) |
| GET, PATCH | `/instance/settings` | Space defaults |
| GET | `/instance/users?q=` | Owner picker with each user's free-space count |
| GET, POST | `/instance/spaces` | List; create (`createSpaceSchema`) |
| GET, PATCH | `/instance/spaces/:teamId` | Detail; change type or cap (`updateSpaceSchema`) |
| POST | `/instance/spaces/:teamId/empty-trash` | Delete the trash now |
| POST | `/instance/spaces/:teamId/cancel-uploads` | Abort uploads in progress |

For members: `GET /teams/:teamId/storage` returns the cap, usage, breakdown, state (`ok`, `warn`,
`full`) and `diskLow`. `GET /teams` includes `spaceType` and `storageCapBytes`. MCP has
`get_team_storage`; the CLI has `teamflow board storage --team <id>`.
