# Teamflow — Docker

Single-container install with SQLite on a Docker volume. Good for VPS or any host that already runs Docker.

See the full guide: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#docker)

## Quick start

```bash
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow/deploy/docker
cp .env.example .env
# Edit .env — set JWT_SECRET and PUBLIC_URL
docker compose up -d --build
```

Open http://localhost:3000

## Update

```bash
cd teamflow
git pull
cd deploy/docker
docker compose up -d --build
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (pnpm → Node server + web UI) |
| `docker-compose.yml` | One service, port 3000, data volume |
| `entrypoint.sh` | Migrate + seed (if empty) + start server |
| `.env.example` | Minimal production env |

Data persists in the `teamflow-data` Docker volume at `/app/data` inside the container.
