#!/bin/bash
# Isolated report end-to-end: clone of the QA database -> private API :4396 + fake model :4398 (nothing leaves the machine) -> gate -> teardown of ONLY the processes/DB it created.
# usage: qa-report-e2e-isolated.sh [gate-script.mjs]   (run from backend/)
set -u; cd "$(dirname "$0")/.."; P=mmri-v3-local-postgres-1; DB=${E2E_DB:-mmri_qa_rc9_e2e}; GATE=${1:-scripts/qa-gate-report-e2e.mjs}; OUT=${E2E_OUT:-/tmp/claude-1000/e2e}; mkdir -p $OUT
docker exec $P psql -U mmri -d postgres -qAt -c "drop database if exists $DB" -c "create database $DB owner mmri_qa_stack" >/dev/null
docker exec $P pg_dump -U mmri -Fc -d mmri_fin_qa_20261116214738 | docker exec -i $P pg_restore -U mmri -d $DB --no-owner --role=mmri_qa_stack 2>&1 | tail -1
set -a; . ~/mmri-qa-runtime/qa-backend.env; set +a
export DATABASE_URL=$(echo "$DATABASE_URL" | sed "s#/mmri_fin_qa_20261116214738#/$DB#") DOTENV_CONFIG_PATH=/dev/null PORT=4396 PGDATABASE=$DB API=http://127.0.0.1:4396/api/v1
export OPENAI_API_KEY=fake-local-key MMRI_AI_REPORT_PROVIDER=openai MMRI_AI_REPORT_MODEL=fake-model MMRI_AI_REPORT_REQUIRED=true MMRI_REPORT_REVIEW_REQUIRED=false MMRI_AI_ANNUAL_PLAN=on MMRI_AI_REPORT_ENDPOINT=http://127.0.0.1:4398/v1/responses MMRI_AI_PRICE_INPUT_USD_PER_M=1 MMRI_AI_PRICE_OUTPUT_USD_PER_M=5 MMRI_MAIL_PROVIDER=mock MMRI_SUPPORT_MAIL_PROVIDER=off MMRI_AI_SCAN_PROVIDER=off
[ -z "${E2E_STRICT:-}" ] && export API_RATE_LIMIT=100000 AUTH_IP_RATE_LIMIT=10000 AUTH_ACCOUNT_RATE_LIMIT=1000 REFRESH_RATE_LIMIT=10000
[ -n "${E2E_ENV:-}" ] && export $E2E_ENV
unset GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET GMAIL_REFRESH_TOKEN GMAIL_USER MMRI_MAIL_RECIPIENT_ALLOWLIST
# never the QA stack's own folders: the clone has the same assessment ids, so a re-rendered PDF would replace the QA artifact
export MMRI_REPORT_STORAGE_DIR=$OUT/report-storage MMRI_MOCK_MAIL_DIR=$OUT/mailbox; mkdir -p "$MMRI_REPORT_STORAGE_DIR" "$MMRI_MOCK_MAIL_DIR"
case "$DATABASE_URL" in *"/$DB"*) ;; *) echo ABORT db; exit 1;; esac
[ -n "${E2E_MIGRATE:-}" ] && { echo "prisma migrate deploy on clone:"; npx prisma migrate deploy 2>&1 | tail -4; }
if [ -z "${E2E_NOFAKE:-}" ]; then npx tsx scripts/lib/qa-fake-openai.mts 4398 > $OUT/fake.log 2>&1 & FP=$!; else FP=$$; fi
npx tsx src/api/server.ts > $OUT/api.log 2>&1 & AP=$!
for i in $(seq 1 60); do curl -s -m2 -o /dev/null http://127.0.0.1:4396/ready && break; sleep 2; done
curl -s -m3 http://127.0.0.1:4396/ready | cut -c1-80; echo
case "$GATE" in *.mts) npx tsx $GATE;; *) node $GATE;; esac; RC=$?
kill $AP 2>/dev/null; [ -z "${E2E_NOFAKE:-}" ] && kill $FP 2>/dev/null; for port in 4396 4398; do for x in $(ss -ltnp 2>/dev/null | sed -n "s/.*127.0.0.1:$port .*pid=\([0-9]*\).*/\1/p"); do kill $x 2>/dev/null; done; done; sleep 3
docker exec $P psql -U mmri -d postgres -qAt -c "drop database if exists $DB with (force)" >/dev/null; echo "teardown done rc=$RC"; exit $RC
