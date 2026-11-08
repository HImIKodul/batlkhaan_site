#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker compose -f "$ROOT/docker-compose.local.yml" -p mmri-v3-local down
echo "MMRI local PostgreSQL stopped. Data was preserved."
