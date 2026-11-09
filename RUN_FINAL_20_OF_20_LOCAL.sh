#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null || true)"
[[ "$NODE_VERSION" == 22.16.* ]] || { echo "ERROR: Node 22.16.x required. Current: ${NODE_VERSION:-missing}" >&2; exit 1; }
exec "$ROOT/START_LOCAL.sh"
