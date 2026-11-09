#!/bin/bash
# Runs a WS-B test against the PRIVATE clone mmri_ws_b / API port 4112 only. usage: qa-wsb-run.sh <script.mjs>
H=/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness
DB=mmri_ws_b; URL="$(cat $H/dburl.base)${DB}?schema=public"
case "$URL" in *"/$DB?schema=public") ;; *) echo "ABORT bad db url"; exit 1;; esac
cd "$(dirname "$0")/.."
set -a; . $H/env-clean.txt; set +a
export DOTENV_CONFIG_PATH=/dev/null DATABASE_URL="$URL" PORT=4112 NODE_ENV=development MMRI_AI_REPORT_PROVIDER=disabled
export WSB_API=http://127.0.0.1:4112/api/v1
export API=$WSB_API PGDATABASE=$DB   # the shared helpers (lib/admin-qa.mjs) read these; without them they would target the shared service and database
exec node "$@"
