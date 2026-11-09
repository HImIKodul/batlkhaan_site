#!/usr/bin/env bash
set -euo pipefail
[[ "${MMRI_CONNECTED_RELEASE_GATE:-NO}" == "YES" ]] || { echo 'FINAL GO requires MMRI_CONNECTED_RELEASE_GATE=YES in connected production-like infrastructure.' >&2; exit 90; }
exec bash "$(cd "$(dirname "$0")" && pwd)/release-gate.sh"
