#!/usr/bin/env bash
# Shared checksum helpers. Sidecars are written with RELATIVE names (basename only) so a backup
# set stays verifiable after being copied to another directory or host (MMRI-09).
# Verification is location-independent: it trusts only the recorded hash and the recorded
# file basename, and ignores any directory prefix (so legacy absolute-path sidecars still verify).

# write_sha256_sidecar FILE  -> FILE.sha256 containing "<hash>  <basename>"
write_sha256_sidecar() {
  local f="$1"
  ( cd "$(dirname "$f")" && sha256sum -- "$(basename "$f")" > "$(basename "$f").sha256" )
}

# verify_sha256_sidecar FILE [SIDECAR]  -> exit 0 only if hash matches and sidecar names this file
verify_sha256_sidecar() {
  local f="$1" side="${2:-$1.sha256}" exp name
  [[ -f "$f" && -f "$side" ]] || return 1
  exp="$(awk 'NR==1{print $1}' "$side")"
  name="$(awk 'NR==1{sub(/^[^[:space:]]+[[:space:]]+\*?/,""); print}' "$side")"
  [[ "$exp" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$(basename -- "$name")" == "$(basename -- "$f")" ]] || return 1
  printf '%s  %s\n' "$exp" "$(basename -- "$f")" | ( cd "$(dirname "$f")" && sha256sum -c - >/dev/null 2>&1 )
}
