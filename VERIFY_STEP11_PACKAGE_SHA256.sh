#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
sha256sum -c STEP11_PACKAGE_SHA256SUMS.txt
