#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

chmod +x CLEAN_PREVIOUS_MMRI.sh RUN_LINUX.sh START_LOCAL.sh STOP_LOCAL.sh RESET_LOCAL_DB.sh CHECK_LINUX.sh VERIFY_LINUX_PACKAGE.sh PUBLISH_TEMPORARY_LINUX.sh SHOW_PUBLIC_LINK.sh 2>/dev/null || true

echo "[1/2] Removing previous extracted MMRI releases and older MMRI ZIPs..."
./CLEAN_PREVIOUS_MMRI.sh --yes

echo
echo "[2/2] Verifying and starting this complete current release..."
exec ./RUN_LINUX.sh
