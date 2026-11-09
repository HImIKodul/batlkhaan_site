#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-checksum.sh"
: "${1:?usage: verify-backup-set.sh backup-set-directory}"
SET_DIR="$1"; [[ -d "$SET_DIR" ]] || { echo 'backup set not found' >&2; exit 70; }
MANIFEST="$SET_DIR/BACKUP_SET.manifest"; [[ -f "$MANIFEST" && -f "$MANIFEST.sha256" ]] || { echo 'backup-set manifest/checksum missing' >&2; exit 71; }
verify_sha256_sidecar "$MANIFEST" || { echo "backup-set manifest checksum mismatch" >&2; exit 81; }
declare -A M=(); while IFS='=' read -r k v; do [[ -n "$k" ]] && M[$k]="$v"; done < "$MANIFEST"
[[ "${M[format]:-}" == 'MMRI-BACKUP-SET-1.0' ]] || { echo 'unsupported backup-set format' >&2; exit 72; }
for k in postgres_file postgres_sha256 report_file report_sha256 migration_chain_sha256 release_sha; do [[ -n "${M[$k]:-}" ]] || { echo "manifest missing $k" >&2; exit 73; }; done
DB="$SET_DIR/${M[postgres_file]}"; REPORT="$SET_DIR/${M[report_file]}"
[[ -f "$DB" && -f "$DB.sha256" && -f "$DB.meta" ]] || { echo 'postgres backup sidecars missing' >&2; exit 74; }
[[ -f "$REPORT" && -f "$REPORT.sha256" && -f "$REPORT.meta" ]] || { echo 'report backup sidecars missing' >&2; exit 75; }
[[ "$(sha256sum "$DB"|awk '{print $1}')" == "${M[postgres_sha256]}" ]] || { echo 'postgres manifest hash mismatch' >&2; exit 76; }
[[ "$(sha256sum "$REPORT"|awk '{print $1}')" == "${M[report_sha256]}" ]] || { echo 'report manifest hash mismatch' >&2; exit 77; }
verify_sha256_sidecar "$DB" || { echo "postgres sidecar checksum mismatch" >&2; exit 82; }; verify_sha256_sidecar "$REPORT" || { echo "report sidecar checksum mismatch" >&2; exit 83; }
pg_restore --list "$DB" >/dev/null; gzip -t "$REPORT"; tar -tzf "$REPORT" >/dev/null
for meta in "$DB.meta" "$REPORT.meta"; do
  grep -Fxq "release_sha=${M[release_sha]}" "$meta" || { echo "release SHA mismatch in $(basename "$meta")" >&2; exit 78; }
  grep -Fxq "migration_chain_sha256=${M[migration_chain_sha256]}" "$meta" || { echo "migration chain mismatch in $(basename "$meta")" >&2; exit 79; }
done
printf 'backup set verified: %s\n' "$SET_DIR"
