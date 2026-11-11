#!/usr/bin/env bash
# Teamflow now installs prebuilt releases; it no longer builds from a git checkout.
# This runs the release installer that sits next to this folder (deploy/install/install.sh).
# On a server that still runs from a checkout, it offers to switch to releases and keeps
# .env, the database and uploads. The usual way to run it:
#
#   curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/../install/install.sh" "$@"
