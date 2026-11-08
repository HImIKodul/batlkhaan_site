#!/usr/bin/env bash
set -euo pipefail
: "${1:?usage: restore-report-storage.sh backup.tar.gz}"
if [[ "${ALLOW_DESTRUCTIVE_RESTORE:-}" != "YES" ]]; then
  echo 'Refusing destructive report-storage restore: set ALLOW_DESTRUCTIVE_RESTORE=YES' >&2
  exit 60
fi
ARCHIVE="$1"
TARGET="${RECOVERY_REPORT_STORAGE_DIR:-}"
[[ -n "$TARGET" ]] || { echo 'RECOVERY_REPORT_STORAGE_DIR is required; restore drills must target isolated storage' >&2; exit 64; }
LIVE="${MMRI_REPORT_STORAGE_DIR:-${REPORT_STORAGE_DIR:-}}"
if [[ -n "$LIVE" && "$(realpath -m "$TARGET")" == "$(realpath -m "$LIVE")" && "${ALLOW_LIVE_REPORT_RESTORE:-}" != "YES" ]]; then
  echo 'Refusing to overwrite live report storage without ALLOW_LIVE_REPORT_RESTORE=YES' >&2; exit 65
fi
[[ -f "$ARCHIVE" ]] || { echo 'report backup not found' >&2; exit 61; }
[[ -f "$ARCHIVE.sha256" ]] || { echo 'checksum sidecar missing' >&2; exit 62; }
case "$TARGET" in ''|'/'|'.'|'..') echo "unsafe recovery report target: $TARGET" >&2; exit 63;; esac
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-checksum.sh"
verify_sha256_sidecar "$ARCHIVE" || { echo "checksum mismatch" >&2; exit 67; }
gzip -t "$ARCHIVE"
# Reject absolute/traversal archive members before extraction.
if tar -tzf "$ARCHIVE" | awk 'BEGIN{bad=0} /^\//{bad=1} /(^|\/)\.\.($|\/)/{bad=1} END{exit bad?0:1}'; then
  echo 'unsafe path found in report backup archive' >&2; exit 66
fi
PARENT="$(dirname "$TARGET")"; mkdir -p "$PARENT"
TMP="$(mktemp -d "$PARENT/.mmri-report-restore.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP" --no-same-owner --no-same-permissions
rm -rf "$TARGET"
mv "$TMP" "$TARGET"
trap - EXIT
printf 'report storage restored from %s to isolated target %s\n' "$ARCHIVE" "$TARGET"
