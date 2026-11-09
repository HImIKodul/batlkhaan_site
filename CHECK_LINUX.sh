#!/usr/bin/env bash
set -u
fail=0
pass(){ printf 'PASS  %s\n' "$1"; }
warn(){ printf 'WARN  %s\n' "$1"; }
failmsg(){ printf 'FAIL  %s\n' "$1"; fail=1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf 'MMRI R17.21 Linux preflight\n\n'

if [[ "$(uname -s 2>/dev/null || true)" == "Linux" ]]; then
  pass "Linux detected: $(uname -sr)"
else
  failmsg "This launcher is intended for Linux."
fi

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p 'process.versions.node')"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  NODE_MINOR="$(printf '%s' "$NODE_VERSION" | cut -d. -f2)"
  if [[ "$NODE_MAJOR" == "22" && "$NODE_MINOR" == "16" ]]; then
    pass "Node.js $NODE_VERSION"
  elif [[ "$NODE_MAJOR" == "22" ]]; then
    warn "Node.js $NODE_VERSION detected. Frozen target is 22.16.x; use .nvmrc if npm engine checks fail."
  else
    failmsg "Node.js 22.16.x is required; found $NODE_VERSION."
  fi
else
  failmsg "Node.js is not installed."
fi

if command -v npm >/dev/null 2>&1; then
  pass "npm $(npm --version)"
else
  failmsg "npm is not installed."
fi

if command -v docker >/dev/null 2>&1; then
  pass "$(docker --version 2>/dev/null | head -1)"
  if docker compose version >/dev/null 2>&1; then
    pass "$(docker compose version 2>/dev/null | head -1)"
  else
    failmsg "Docker Compose v2 is missing; 'docker compose' must work."
  fi
  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is reachable by the current user"
  else
    failmsg "Docker is installed but the daemon is unavailable or this user lacks permission. Start Docker and ensure your user can run 'docker info'."
  fi
else
  failmsg "Docker Engine is not installed."
fi

required=(
  "backend/package.json"
  "backend/src/api/server.ts"
  "backend/prisma/schema.prisma"
  "backend/.env.example"
  "frontend/package.json"
  "frontend/src/App.tsx"
  "frontend/src/data/canonicalCapabilities.ts"
  "frontend/.env.example"
  "backend/methodology/MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json"
  "docker-compose.local.yml"
  "START_LOCAL.sh"
)
for rel in "${required[@]}"; do
  if [[ -e "$ROOT/$rel" ]]; then
    pass "Included: $rel"
  else
    failmsg "Missing required package file: $rel"
  fi
done

echo
if [[ "$fail" -eq 0 ]]; then
  echo "Linux preflight passed. Run: ./RUN_LINUX.sh"
else
  echo "Linux preflight failed. Fix the FAIL items above, then rerun ./CHECK_LINUX.sh."
fi
exit "$fail"
