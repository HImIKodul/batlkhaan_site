#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
LOG="$ROOT/MMRI_SAFE_RUN_$(date +%Y%m%d_%H%M%S).log"

# Keep a complete diagnostic log while still showing progress in the terminal.
exec > >(tee -a "$LOG") 2>&1

pause_on_error() {
  local status="$1" line="$2" cmd="$3"
  trap - ERR
  echo
  echo "============================================================"
  echo " MMRI STOPPED WITH AN ERROR"
  echo " Exit code: $status"
  echo " Line:      $line"
  echo " Command:   $cmd"
  echo " Log file:  $LOG"
  echo "============================================================"
  echo
  echo "Copy the LAST 30-50 lines from this terminal and send them to ChatGPT."
  if [[ -t 0 ]]; then
    read -r -p "Press ENTER to keep/close this terminal... " _ || true
  else
    sleep 8
  fi
  exit "$status"
}
trap 'pause_on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

step(){ echo; echo "===== $* ====="; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is required."; return 1; }; }

step "BASIC REQUIREMENTS"
need bash
need node
need npm
need python3
need docker

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 is required (command: docker compose)."
  false
fi

NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NPM_VERSION="$(npm -v)"

echo "Node: v$NODE_VERSION"
echo "npm:  $NPM_VERSION"
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"

if [[ "$NODE_MAJOR" != "22" ]]; then
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    echo "Node 22 is required. Switching with nvm..."
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm install 22.16.0
    nvm use 22.16.0
    NODE_VERSION="$(node -p 'process.versions.node')"
  else
    echo "ERROR: Node.js 22.x is required. Current: v$NODE_VERSION"
    echo "nvm was not found at $NVM_DIR/nvm.sh"
    false
  fi
fi

# The frozen release metadata pins 22.16.x, but the user's existing 22.x runtime
# can build the source as well. Disable npm's engine-strict rejection for this
# local acceptance install while preserving the package metadata unchanged.
export npm_config_engine_strict=false
export MMRI_PDF_PYTHON_PATH="${MMRI_PDF_PYTHON_PATH:-/usr/bin/python3}"

step "BACKEND CLEAN DEPENDENCY INSTALL"
cd "$ROOT/backend"
rm -rf node_modules dist dist-engine dist-strategy
npm ci --no-audit --no-fund --engine-strict=false

step "FINAL 20/20 SOURCE VERIFICATION"
cd "$ROOT"
chmod +x ./*.sh backend/scripts/*.sh 2>/dev/null || true
./VERIFY_FINAL_20_OF_20_SOURCE.sh

step "BACKEND BUILD + PDF REGRESSION"
cd "$ROOT/backend"
npm run build:prod
npm run strategy:typecheck
npm run engine:typecheck
npm run backend:step12:pdf:verify

step "FRONTEND CLEAN DEPENDENCY INSTALL"
cd "$ROOT/frontend"
rm -rf node_modules dist
npm ci --no-audit --no-fund --engine-strict=false

step "FRONTEND PRODUCTION BUILD"
npm run build

step "FULL REGRESSION HARNESS"
cd "$ROOT"
bash VERIFY_STEP11_FULL_REGRESSION.sh

step "FINAL POST-BUILD FREEZE CHECK"
./VERIFY_STEP10_FINAL_FREEZE.sh --post-build

step "START LOCAL MMRI"
echo "The next stage creates/uses LOCAL Docker PostgreSQL and local mock payment settings."
echo "It does not replace your existing MMRI project."
echo
./START_LOCAL.sh
