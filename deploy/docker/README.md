# Teamflow — Docker (optional)

Single-container install with SQLite on a Docker volume. This is an optional extra for hosts that already run Docker; the supported setups are [Windows (A)](../windows/README.md) and [Proxmox LXC (B)](../proxmox-lxc/README.md).

See also: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#appendix-docker-optional)

## Quick start

```bash
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow/deploy/docker
cp .env.example .env
# Edit .env: JWT_SECRET must be a real random value (the server refuses the placeholder), PUBLIC_URL
docker compose up -d --build
```

Open the setup link the server logs (`docker compose logs | grep "Setup code"`, link `http://localhost:3000/setup?code=…`) and create the instance admin account ([docs/SETUP.md](../../docs/SETUP.md)). No demo user is created unless you add `TEAMFLOW_SEED_DEMO=1` to `.env`.

Requirements: Docker Engine with Compose v2, about 1 GB for the image build, and more than 2 GB free on the disk behind the `teamflow-data` volume (uploads pause below that; see [docs/SPACES.md](../../docs/SPACES.md)). The image builds `better-sqlite3` itself, so nothing else is needed on the host.

**Port:** keep `PORT=3000` in `.env`. Compose uses that one value both for the host port and, through `env_file`, for the port the server listens on inside the container, so `PORT=8080` publishes 8080 to a container port nobody listens on. To use another host port, change the left side of `ports:` in `docker-compose.yml` (for example `"8080:3000"`).

The image runs with `NODE_ENV=production`. Add `TEAMFLOW_SECRETS_KEY`, `CORS_ORIGINS`, `TEAMFLOW_TRUST_PROXY=1`, SMTP and the other variables from the [production checklist](../../docs/SELF-HOSTING.md#production-checklist) to `.env` as needed.

## Update

```bash
cd teamflow
git pull
cd deploy/docker
docker compose up -d --build
```

## Limits

- Server admin → Updates & backups and the Discord bot service buttons do not work in the container (no host scripts, no sudo). Update with the commands above; run the bot separately.
- Trash purge: `docker compose exec teamflow pnpm db:maintenance`, or `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` in `.env`.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build on `node:20-bookworm-slim` (pnpm → server + web UI) |
| `docker-compose.yml` | One service, port `${PORT:-3000}:3000`, `teamflow-data` volume, `SERVE_WEB=true` |
| `entrypoint.sh` | `db migrate`, `db seed` (no-op unless `TEAMFLOW_SEED_DEMO=1`), start server |
| `.env.example` | Minimal production env |

Data persists in the `teamflow-data` volume at `/app/data` inside the container (database and uploads).
