#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
COMPOSE="$ROOT/docker-compose.local.yml"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' is required but not installed." >&2
    exit 1
  fi
}
need node
need npm
need docker

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 is required ('docker compose')." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "ERROR: Node.js 22.x is required. Current: $(node -v)" >&2
  exit 1
fi

echo "[1/13] Starting local PostgreSQL on localhost:55432..."
docker compose -f "$COMPOSE" -p mmri-v3-local up -d postgres

for i in {1..60}; do
  if docker compose -f "$COMPOSE" -p mmri-v3-local exec -T postgres pg_isready -U mmri -d mmri >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "ERROR: PostgreSQL did not become ready." >&2
    exit 1
  fi
  sleep 1
done

rand_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    printf '%s' "local-dev-secret-$(date +%s)-$RANDOM-$RANDOM-abcdefghijklmnopqrstuvwxyz"
  fi
}

if [[ ! -f "$BACKEND/.env" ]]; then
  echo "[2/13] Creating backend/.env for local v3.0.3 accepted final..."
  ACCESS_SECRET="$(rand_secret)"
  PEPPER="$(rand_secret)"
  AUDIT_SALT="$(rand_secret)"
  cat > "$BACKEND/.env" <<EOF
DATABASE_URL="postgresql://mmri:mmri@127.0.0.1:55432/mmri?schema=public"
NODE_ENV="development"
PORT=4000
MMRI_TARGET_METHODOLOGY_VERSION="3.0.3"
MMRI_TARGET_QUESTION_BANK_VERSION="3.1.3"
MMRI_TARGET_QUESTION_BANK_ARRAY_SHA256="8d67f1e41fb05f5f92edd46ad8c21b8f696f7b5de315c573eba212bcca0fcc91"
MMRI_TARGET_METHODOLOGY_BUNDLE_SHA256="4ec42fb9fb7fd0d55c482bf5bbea379fb4cd3e9e97fd1921d405bbb432734c79"
MMRI_TARGET_METHODOLOGY_BUNDLE="methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json"
MMRI_ENVIRONMENT="development"
MMRI_INTEGRATION_RESET_OK="NO"
MMRI_INTEGRATION_ACTIVATE_CANDIDATE="NO"
ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
ACCESS_TOKEN_ISSUER="mmri-api"
ACCESS_TOKEN_AUDIENCE="mmri-web"
ACCESS_TOKEN_SECRET="$ACCESS_SECRET"
PASSWORD_PEPPER="$PEPPER"
AUDIT_HASH_SALT="$AUDIT_SALT"
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
REFRESH_COOKIE_NAME="mmri_refresh"
COOKIE_SECURE=false
TRUST_PROXY=false
REQUEST_BODY_LIMIT_BYTES=1000000
REQUEST_TIMEOUT_MS=30000
HEADERS_TIMEOUT_MS=15000
KEEP_ALIVE_TIMEOUT_MS=5000
API_RATE_LIMIT=600
AUTH_IP_RATE_LIMIT=20
AUTH_ACCOUNT_RATE_LIMIT=10
REFRESH_RATE_LIMIT=60
RATE_LIMIT_WINDOW_MS=60000
MMRI_BILLING_PROVIDER="mock"
MMRI_BILLING_ENFORCEMENT=true
MMRI_DIAGNOSTIC_PRICE_MNT="300000"
MMRI_RETAKE_PRICE_MNT="300000"
MMRI_BILLING_CALLBACK_BASE_URL="http://127.0.0.1:4000"
QPAY_BASE_URL="https://merchant-sandbox.qpay.mn"
QPAY_CLIENT_ID=""
QPAY_CLIENT_SECRET=""
QPAY_INVOICE_CODE=""
MMRI_AI_REPORT_PROVIDER="disabled"
MMRI_AI_REPORT_REQUIRED=false
MMRI_AI_REPORT_MODEL=""
MMRI_AI_REPORT_ENDPOINT="https://api.openai.com/v1/responses"
MMRI_AI_REPORT_TIMEOUT_MS=45000
MMRI_AI_REPORT_MAX_OUTPUT_TOKENS=8000
OPENAI_API_KEY=""
EOF
else
  echo "[2/13] backend/.env already exists; keeping it."
fi

cat > "$FRONTEND/.env" <<'EOF'
VITE_DEV_API_TARGET=http://127.0.0.1:4000
VITE_MMRI_DIAGNOSTIC_PRICE_MNT=300000
VITE_MMRI_RETAKE_PRICE_MNT=300000
EOF

echo "[3/13] Installing backend dependencies (first run may take a while)..."
cd "$BACKEND"
if [[ ! -d node_modules ]]; then
  npm install
else
  echo "backend/node_modules already present; skipping npm install."
fi

echo "[4/13] Generating Prisma client and applying committed migrations..."
npm run db:generate
npm run db:migrate:deploy

echo "[5/13] Validating and importing MMRI Marketing methodology v3.0.3 (production)..."
npm run validate:bundle
MMRI_EXPECT_METHODOLOGY_VERSION=3.0.3 \
MMRI_IMPORT_TARGET_ONLY=YES \
npx tsx src/import-methodology.ts methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json

MMRI_EXPECT_METHODOLOGY_STATUS=ACTIVE \
npx tsx src/verify-methodology-import.ts 3.0.3 methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json

echo "[6/13] Importing four BusinessMRI domain candidates..."
npm run domains:import

echo "[7/13] Promoting all five verified accepted finals in this local database..."
MMRI_FIVE_DOMAIN_PROMOTION_OK=YES MMRI_ENVIRONMENT=integration npm run domains:promote

echo "[8/13] Verifying five-domain runtime bindings..."
npm run domains:verify

echo "[9/13] Creating/updating Mongolian demo company..."
npm run demo:seed

echo "[10/13] Verifying demo results and report payloads..."
npm run demo:verify

echo "[11/13] Installing frontend dependencies..."
cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  npm install
else
  echo "frontend/node_modules already present; skipping npm install."
fi

echo "[12/13] Verifying frontend production build..."
npm run build

echo "[13/14] Starting backend on http://127.0.0.1:4000"
cd "$BACKEND"
npm run api:dev &
BACK_PID=$!

cleanup() {
  echo
  echo "Stopping MMRI frontend/backend..."
  kill "$BACK_PID" "${FRONT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2
if ! kill -0 "$BACK_PID" 2>/dev/null; then
  echo "ERROR: Backend exited during startup." >&2
  wait "$BACK_PID" || true
  exit 1
fi

echo "[14/14] Starting frontend on http://localhost:5173"
cd "$FRONTEND"
npm run dev -- --host 0.0.0.0 &
FRONT_PID=$!

sleep 2
if ! kill -0 "$FRONT_PID" 2>/dev/null; then
  echo "ERROR: Frontend exited during startup." >&2
  wait "$FRONT_PID" || true
  exit 1
fi

echo
echo "============================================================"
echo " MMRI five-domain Step 7/7 is running"
echo " Open: http://localhost:5173"
echo " API:  http://localhost:4000"
echo " Демо имэйл: demo@mmri.mn"
echo " Демо нууц үг: Demo2026!!"
echo " Press Ctrl+C in this terminal to stop frontend/backend."
echo " PostgreSQL stays running until ./STOP_LOCAL.sh is executed."
echo "============================================================"
echo
wait "$BACK_PID" "$FRONT_PID"
