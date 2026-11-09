#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib-checksum.sh"
SRC="${MMRI_REPORT_STORAGE_DIR:-${REPORT_STORAGE_DIR:-$REPO_ROOT/report-storage}}"; DEST="${BACKUP_DIR:-$REPO_ROOT/backups/reports}"
[[ -d "$SRC" ]] || { echo "report storage not found: $SRC" >&2; exit 51; }
mkdir -p "$DEST"; STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; OUT="$DEST/mmri-reports-$STAMP.tar.gz"; umask 077
MIGRATION_CHAIN_SHA256="$(node "$SCRIPT_DIR/migration-chain.mjs")"
tar -C "$SRC" -czf "$OUT" .; gzip -t "$OUT"; write_sha256_sidecar "$OUT"
cat > "$OUT.meta" <<META
created_at_utc=$STAMP
release_sha=${RELEASE_SHA:-unknown}
migration_chain_sha256=$MIGRATION_CHAIN_SHA256
artifact_type=report_storage_tar_gzip
META
chmod 600 "$OUT" "$OUT.sha256" "$OUT.meta"
printf '%s\n' "$OUT"
