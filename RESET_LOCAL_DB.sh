#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "This deletes ONLY the Docker volume used by MMRI_RUN_LOCAL_v3.0.0."
read -r -p "Type RESET to continue: " answer
[[ "$answer" == "RESET" ]] || { echo "Cancelled."; exit 0; }
docker compose -f "$ROOT/docker-compose.local.yml" -p mmri-v3-local down -v
echo "Local MMRI database deleted. Run ./START_LOCAL.sh to recreate it."
