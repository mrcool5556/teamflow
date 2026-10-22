#!/bin/sh
set -e
cd /app

pnpm --filter @teamflow/db migrate
# Demo data only when TEAMFLOW_SEED_DEMO=1; otherwise the seed is a no-op and the
# first registered user becomes the instance admin.
pnpm --filter @teamflow/db seed

exec node apps/server/dist/index.js
