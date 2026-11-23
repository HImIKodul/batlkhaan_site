#!/bin/bash
# Disposable UI stack on a CLONE of the QA database (never touches :4300/:5180 or the QA DB):
#   API :4396 (+ optional fake model :4398 when AI=fake), Vite :5190 serving the integrated frontend with its /api proxy pointed at :4396.
# The owner's login is NOT used: a throwaway password for the clone's copy of the owner's account is generated into /tmp (mode 600), clone only.
# usage: qa-ui-clone-stack.sh start [AI=disabled|fake] | stop
set -u; cd "$(dirname "$0")/.."; P=mmri-v3-local-postgres-1; DB=mmri_qa_rc9_uiclone; ST=/tmp/claude-1000/uiclone; mkdir -p $ST
FE=${FE:-$(cd .. && pwd)/frontend}
stop(){ for f in api fake vite; do [ -f $ST/$f.pid ] && kill $(cat $ST/$f.pid) 2>/dev/null; done; for port in 4396 4398 5190; do for x in $(ss -ltnp 2>/dev/null | sed -n "s/.*127.0.0.1:$port .*pid=\([0-9]*\).*/\1/p"); do kill $x 2>/dev/null; done; done; sleep 2; rm -f $ST/*.pid; docker exec $P psql -U mmri -d postgres -qAt -c "drop database if exists $DB with (force)" >/dev/null; echo stopped; }
[ "${1:-}" = stop ] && { stop; exit 0; }
AI=${2:-disabled}; stop >/dev/null
docker exec $P psql -U mmri -d postgres -qAt -c "create database $DB owner mmri_qa_stack" >/dev/null
docker exec $P pg_dump -U mmri -Fc -d mmri_fin_qa_20261116214738 | docker exec -i $P pg_restore -U mmri -d $DB --no-owner --role=mmri_qa_stack 2>&1 | tail -1
set -a; . ~/mmri-qa-runtime/qa-backend.env; set +a
export DATABASE_URL=$(echo "$DATABASE_URL" | sed "s#/mmri_fin_qa_20261116214738#/$DB#") DOTENV_CONFIG_PATH=/dev/null PORT=4396 PGDATABASE=$DB
case "$DATABASE_URL" in *"/$DB"*) ;; *) echo ABORT; exit 1;; esac
unset GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET GMAIL_REFRESH_TOKEN GMAIL_USER MMRI_MAIL_RECIPIENT_ALLOWLIST OPENAI_API_KEY
export MMRI_MAIL_PROVIDER=mock MMRI_SUPPORT_MAIL_PROVIDER=off MMRI_AI_SCAN_PROVIDER=off MMRI_BILLING_PROVIDER=mock MMRI_BILLING_ENFORCEMENT=true API_RATE_LIMIT=100000 AUTH_IP_RATE_LIMIT=10000 AUTH_ACCOUNT_RATE_LIMIT=1000 REFRESH_RATE_LIMIT=10000 ALLOWED_ORIGINS=http://localhost:5190,http://127.0.0.1:5190
# throwaway password for the clone's copy of the owner's account
TP="Ui-$(head -c 9 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')-9a!"; umask 077; echo "$TP" > $ST/owner-clone-password
cat > scripts/.tmp-clone-pw.mts <<'T'
import {prisma} from "../src/db.js";import {hashPassword} from "../src/api/auth/crypto.js";import fs from "node:fs";
const db=decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));if(db!=="mmri_qa_rc9_uiclone")throw new Error("REFUSED "+db);
const pw=fs.readFileSync("/tmp/claude-1000/uiclone/owner-clone-password","utf8").trim();
await prisma.user.update({where:{email:"batkhaan91+customer@gmail.com"},data:{passwordHash:await hashPassword(pw,process.env.PASSWORD_PEPPER!),tokenVersion:{increment:1}}});await prisma.$disconnect();console.log("clone owner password set");
T
npx tsx scripts/.tmp-clone-pw.mts 2>&1 | tail -1; rm -f scripts/.tmp-clone-pw.mts
if [ "$AI" = fake ]; then
  export OPENAI_API_KEY=fake-local-key MMRI_AI_REPORT_PROVIDER=openai MMRI_AI_REPORT_MODEL=fake-model MMRI_AI_REPORT_REQUIRED=true MMRI_REPORT_REVIEW_REQUIRED=false MMRI_AI_ANNUAL_PLAN=on MMRI_AI_REPORT_ENDPOINT=http://127.0.0.1:4398/v1/responses MMRI_AI_PRICE_INPUT_USD_PER_M=1 MMRI_AI_PRICE_OUTPUT_USD_PER_M=5 E2E_OUT=$ST
  setsid npx tsx scripts/lib/qa-fake-openai.mts 4398 > $ST/fake.log 2>&1 < /dev/null & echo $! > $ST/fake.pid
fi
setsid npx tsx src/api/server.ts > $ST/api.log 2>&1 < /dev/null & echo $! > $ST/api.pid
for i in $(seq 1 60); do curl -s -m2 -o /dev/null http://127.0.0.1:4396/ready && break; sleep 2; done
cd $FE && VITE_DEV_API_TARGET=http://127.0.0.1:4396 setsid node_modules/.bin/vite --host 127.0.0.1 --port 5190 --strictPort > $ST/vite.log 2>&1 < /dev/null & echo $! > $ST/vite.pid
sleep 4; echo "api $(curl -s -m3 -o /dev/null -w %{http_code} http://127.0.0.1:4396/ready) vite $(curl -s -m3 -o /dev/null -w %{http_code} http://127.0.0.1:5190/) AI=$AI (clone DB $DB)"
