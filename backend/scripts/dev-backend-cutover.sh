#!/usr/bin/env bash
# Local development cutover of the API from the OLD source folder to THIS source folder, keeping the existing database.
#   check    read-only: who listens where, from which folder, with which release id
#   prepare  backup (verified) -> additive migrations -> start a CANDIDATE on $CANDIDATE_PORT (default 4003) -> verify it is this code
#   switch   stop ONLY the old process on $API_PORT (default 4000, after proving it runs from the old folder) -> start this code there -> verify
# Never prints DATABASE_URL, tokens or keys. Never resets, reseeds or deletes data. Honours a DATABASE_URL already in the environment (use it to rehearse on a copy).
set -euo pipefail
MODE="${1:-check}"
NEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$NEW_ROOT/backend"
OLD_ROOT="${OLD_ROOT:-/home/kirby/MMRI_STEP10_FINAL_WORKING}"
API_PORT="${API_PORT:-4000}"; CANDIDATE_PORT="${CANDIDATE_PORT:-4003}"
CONTAINER="${CONTAINER:-mmri-v3-local-postgres-1}"
LOGDIR="${LOGDIR:-$NEW_ROOT/.cutover-logs}"; mkdir -p "$LOGDIR"
[ "$NEW_ROOT" != "$OLD_ROOT" ] || { echo "REFUSING: this script must run from the NEW folder, not $OLD_ROOT"; exit 2; }

listener_pid() { ss -ltnp 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" {print $6}' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
proc_cwd() { readlink "/proc/$1/cwd" 2>/dev/null || echo "?"; }
health() { curl -s --max-time 3 "http://127.0.0.1:$1/health" || true; }
field() { sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" <<<"$1"; }
fingerprint() { (cd "$NEW_ROOT" && find backend/src backend/prisma -type f ! -name '*.log' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-12); }
db_url() { if [ -n "${DATABASE_URL:-}" ]; then printf '%s' "$DATABASE_URL"; else sed -n 's/^DATABASE_URL=//p' "$BACKEND/.env" | head -1 | sed 's/^"//; s/"$//'; fi; }

report() {
  for port in "$API_PORT" "$CANDIDATE_PORT"; do
    pid="$(listener_pid "$port" || true)"
    if [ -z "$pid" ]; then echo ":$port  nothing listening"; continue; fi
    cwd="$(proc_cwd "$pid")"; h="$(health "$port")"
    where="OTHER"; case "$cwd" in "$NEW_ROOT"*) where="NEW source";; "$OLD_ROOT"*) where="OLD source";; esac
    echo ":$port  pid=$pid  runs-from=$where  cwd=$cwd  releaseSha=$(field "$h" releaseSha)  instance=$(field "$h" instanceId)"
  done
  echo "expected release id for this source: step10-$(fingerprint)"
}

# Non-secret runtime flags are carried over from the process being replaced, so the new API behaves like the old one (review workflow, AI disabled, mock billing...).
carry_flags() {
  local pid="$1" out=() k v
  [ -n "$pid" ] && [ -r "/proc/$pid/environ" ] || return 0
  while IFS= read -r -d '' kv; do k="${kv%%=*}"; v="${kv#*=}"
    case "$k" in MMRI_REPORT_REVIEW_REQUIRED|MMRI_AI_REPORT_PROVIDER|MMRI_MAIL_PROVIDER|MMRI_BILLING_PROVIDER|NODE_ENV|ALLOWED_ORIGINS|MMRI_REPORT_PREWARM) out+=("$k=$v");;
      OPENAI_API_KEY) [ -z "$v" ] && out+=("OPENAI_API_KEY=");;   # an explicitly blanked key stays blank (no paid AI calls); a real key is never read or printed
    esac
  done < "/proc/$pid/environ"
  printf '%s\0' "${out[@]}"
}

start_backend() {   # $1=port  $2=instance id  $3=file of carried flags (NUL separated), written by carry_flags BEFORE the old process is stopped
  local port="$1" inst="$2" rel="step10-$(fingerprint)" flags=() origins="" kv
  if [ -n "${3:-}" ] && [ -s "$3" ]; then while IFS= read -r -d '' kv; do
      case "$kv" in ALLOWED_ORIGINS=*) origins="${kv#ALLOWED_ORIGINS=}";; *) flags+=("$kv");; esac
    done < "$3"; fi
  # the browser origin of the new frontend (5174) must be allowed, otherwise every browser login/refresh POST is refused with CORS_ORIGIN_DENIED
  origins="${origins:+$origins,}http://127.0.0.1:5174,http://localhost:5174"
  flags+=("ALLOWED_ORIGINS=$origins")
  echo "starting this source on :$port (release $rel). Flags carried (non-secret): $(printf '%s ' "${flags[@]}" | sed -E 's/OPENAI_API_KEY=[^ ]*/OPENAI_API_KEY=<blank>/')"
  ( cd "$BACKEND" && exec env "${flags[@]}" PORT="$port" RELEASE_SHA="$rel" INSTANCE_ID="$inst" DATABASE_URL="$(db_url)" nohup npx tsx src/api/server.ts ) > "$LOGDIR/api-$port.log" 2>&1 < /dev/null &
  local h pid
  for _ in $(seq 1 40); do sleep 1; h="$(health "$port")"; [ "$(field "$h" releaseSha)" = "$rel" ] && break; done
  h="$(health "$port")"; pid="$(listener_pid "$port")"
  [ "$(field "$h" releaseSha)" = "$rel" ] || { echo "FAIL: :$port did not come up with release $rel (see $LOGDIR/api-$port.log)"; exit 1; }
  case "$(proc_cwd "$pid")" in "$BACKEND"*) ;; *) echo "FAIL: :$port is not running from $BACKEND"; exit 1;; esac
  echo "OK: :$port runs THIS source (pid $pid, release $rel)"
}

case "$MODE" in
  check) report ;;
  prepare)
    url="$(db_url)"; [ -n "$url" ] || { echo "no DATABASE_URL"; exit 2; }
    dbname="$(sed -E 's#^[a-z]+://[^/]+/([^?]+).*#\1#' <<<"$url")"; dbuser="$(sed -E 's#^[a-z]+://([^:@]+).*#\1#' <<<"$url")"
    TS="$(date +%Y%m%d_%H%M%S)"; BK="$HOME/MMRI_BACKUPS/cutover_$TS"; mkdir -p "$BK"
    echo "1/4 backup of database '$dbname' -> $BK (read-only dump)"
    docker exec "$CONTAINER" pg_dump -U "$dbuser" -d "$dbname" --no-owner | gzip > "$BK/$dbname.sql.gz"
    gzip -t "$BK/$dbname.sql.gz"; ( cd "$BK" && sha256sum "$dbname.sql.gz" > SHA256SUMS ); echo "    verified: $(du -h "$BK/$dbname.sql.gz" | cut -f1)"
    echo "2/4 migration status (additive migrations only; nothing is dropped or reset)"
    ( cd "$BACKEND" && DATABASE_URL="$url" npx prisma migrate status 2>&1 | tail -6 ) || true
    ( cd "$BACKEND" && DATABASE_URL="$url" npx prisma migrate deploy 2>&1 | tail -3 )
    echo "3/4 candidate backend"; FLAGS="$LOGDIR/flags.$TS.bin"; carry_flags "$(listener_pid "$API_PORT" || true)" > "$FLAGS"; start_backend "$CANDIDATE_PORT" "new-src-candidate" "$FLAGS"
    echo "4/4 report"; report
    echo "Next: ./scripts/dev-backend-cutover.sh switch   (replaces only the old process on :$API_PORT; rollback = restart the old folder's backend)" ;;
  switch)
    old="$(listener_pid "$API_PORT" || true)"
    if [ -n "$old" ]; then
      case "$(proc_cwd "$old")" in "$OLD_ROOT"*) ;; "$NEW_ROOT"*) echo "Already running from the NEW source on :$API_PORT"; report; exit 0;; *) echo "REFUSING: :$API_PORT is owned by an unknown process ($(proc_cwd "$old"))"; exit 2;; esac
      cand="$(listener_pid "$CANDIDATE_PORT" || true)"
      FLAGS="$LOGDIR/flags.$(date +%Y%m%d_%H%M%S).bin"; carry_flags "$old" > "$FLAGS"   # read BEFORE the process disappears
      echo "stopping OLD backend pid $old on :$API_PORT (graceful)"; kill -TERM "$old"
      for _ in $(seq 1 30); do kill -0 "$old" 2>/dev/null || break; sleep 1; done
      kill -0 "$old" 2>/dev/null && { echo "old process still draining; aborting (nothing started)"; exit 1; }
    else FLAGS=""; echo "nothing on :$API_PORT"; fi
    start_backend "$API_PORT" "new-src" "${FLAGS:-}"
    [ -n "${cand:-}" ] && kill -TERM "$cand" 2>/dev/null || true
    report ;;
  *) echo "usage: $0 check|prepare|switch"; exit 2 ;;
esac
