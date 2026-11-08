#!/usr/bin/env bash
set -euo pipefail
LOG="/tmp/mmri-cloudflare.log"
URL="$(grep -oE 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -n 1 || true)"
if [[ -z "$URL" ]]; then
  echo "Түр нийтийн холбоос олдсонгүй. PUBLISH_TEMPORARY_LINUX.sh ажиллаж байгаа эсэхийг шалгана уу."
  [[ -f "$LOG" ]] && tail -n 30 "$LOG"
  exit 1
fi
printf '%s\n' "$URL"
