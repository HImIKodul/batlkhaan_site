#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

chmod +x START_LOCAL.sh STOP_LOCAL.sh RESET_LOCAL_DB.sh CHECK_LINUX.sh VERIFY_LINUX_PACKAGE.sh PUBLISH_TEMPORARY_LINUX.sh SHOW_PUBLIC_LINK.sh 2>/dev/null || true

./VERIFY_LINUX_PACKAGE.sh
./CHECK_LINUX.sh

echo
echo "Starting MMRI five-domain Data Step 7/7 local stack..."
exec ./START_LOCAL.sh
