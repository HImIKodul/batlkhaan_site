#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node --version
npm --version
[[ "$(node --version)" == v22.16.* ]] || { echo "Node 22.16.x required" >&2; exit 2; }
for dir in backend frontend; do
  echo "Generating $dir/package-lock.json from exact direct dependency specifications"
  (cd "$dir" && rm -f package-lock.json && npm install --package-lock-only --ignore-scripts --no-audit --no-fund)
done
node ops/verify-lockfiles.mjs
echo "Lockfiles generated and verified. Review and commit both package-lock.json files before release."
