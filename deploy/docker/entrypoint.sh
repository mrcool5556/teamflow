#!/bin/sh
set -e
cd /app

pnpm --filter @teamflow/db migrate
pnpm --filter @teamflow/db seed

exec node apps/server/dist/index.js
