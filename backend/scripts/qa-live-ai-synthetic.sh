#!/usr/bin/env bash
# Usage: MMRI_AI_LIVE_SYNTHETIC_APPROVED=YES_USD_0_50_CAP scripts/qa-live-ai-synthetic.sh <payload-dir> <out-dir>
# Hands the live check ONLY the API key and model (never DATABASE_URL, never the rest of backend/.env) and runs it under Node's permission model.
set -euo pipefail
B=$(cd "$(dirname "$0")/.." && pwd); PAY=$(readlink -f "$1"); OUT=$(readlink -m "$2"); mkdir -p "$OUT"
getv(){ grep -E "^$1=" "$B/.env" | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
KEY=$(getv OPENAI_API_KEY); MODEL=$(getv MMRI_AI_REPORT_MODEL)
exec env -i PATH="$PATH" HOME=/nonexistent OPENAI_API_KEY="$KEY" MMRI_AI_REPORT_MODEL="$MODEL" \
  MMRI_AI_LIVE_SYNTHETIC_APPROVED="${MMRI_AI_LIVE_SYNTHETIC_APPROVED:-}" LIVE_MAX_REQUESTS="${LIVE_MAX_REQUESTS:-8}" LIVE_COST_CAP_USD="${LIVE_COST_CAP_USD:-0.5}" LIVE_SPENT_BEFORE_USD="${LIVE_SPENT_BEFORE_USD:-0}" LIVE_EXPECT_FILES="${LIVE_EXPECT_FILES:-5}" \
  node --permission --allow-fs-read="$B/scripts/qa-live-ai-synthetic.mjs" --allow-fs-read="$B/dist-strategy" --allow-fs-read="$B/node_modules" --allow-fs-read="$B/package.json" --allow-fs-read="$B/dist-strategy/package.json" --allow-fs-read="$PAY" --allow-fs-write="$OUT" --allow-fs-read="$OUT" \
  "$B/scripts/qa-live-ai-synthetic.mjs" "$PAY" "$OUT"
