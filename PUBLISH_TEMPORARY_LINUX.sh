#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
LOG="/tmp/mmri-cloudflare.log"
TUNNEL_PID=""

say(){ printf '\n%s\n' "$*"; }

# SAFETY: this publishes the Vite DEV server (and through its proxy the API on :4000) to the internet.
# Only do that against an isolated staging database with throw-away accounts, never the live "mmri" data.
if [[ "${MMRI_PUBLIC_PREVIEW_ACK:-}" != "STAGING_ONLY" ]]; then
  echo "REFUSING: a public tunnel exposes the dev stack. Use an isolated staging DB with throw-away accounts, then re-run with MMRI_PUBLIC_PREVIEW_ACK=STAGING_ONLY"
  exit 2
fi

install_cloudflared(){
  if command -v cloudflared >/dev/null 2>&1; then return 0; fi
  say "Cloudflare түр холболтыг суулгаж байна..."
  sudo mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
}

cleanup(){
  if [[ -n "${TUNNEL_PID:-}" ]]; then kill "$TUNNEL_PID" 2>/dev/null || true; fi
  pkill -f 'cloudflared tunnel.*5173' 2>/dev/null || true
}
trap cleanup EXIT INT TERM

install_cloudflared
pkill -f 'cloudflared tunnel.*5173' 2>/dev/null || true
rm -f "$LOG"

cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5173 --http-host-header localhost >"$LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in {1..45}; do
  PUBLIC_URL="$(grep -oE 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -n 1 || true)"
  [[ -n "$PUBLIC_URL" ]] && break
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "ERROR: Түр нийтийн холбоос үүссэнгүй."
  cat "$LOG" || true
  exit 1
fi
PUBLIC_HOST="${PUBLIC_URL#https://}"

# START_LOCAL.sh creates backend/.env on a first run. If it already exists,
# permit the generated HTTPS origin before the backend starts.
if [[ -f backend/.env ]]; then
  if grep -q '^ALLOWED_ORIGINS=' backend/.env; then
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=\"http://localhost:5173,http://127.0.0.1:5173,$PUBLIC_URL\"|" backend/.env
  else
    printf '\nALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,%s"\n' "$PUBLIC_URL" >> backend/.env
  fi
fi

cat <<TXT

============================================================
 MMRI ТҮР НИЙТИЙН ХОЛБООС

 $PUBLIC_URL

 Энэ холбоосыг өөр сүлжээний Windows хэрэглэгчид илгээнэ.
 Энэ терминалыг нээлттэй байлгана.
 Ctrl+C дарвал түр нийтлэх ажиллагаа зогсоно.
============================================================
TXT

export ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,$PUBLIC_URL"
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$PUBLIC_HOST"
./RUN_LINUX.sh
