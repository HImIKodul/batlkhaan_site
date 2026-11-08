#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_REAL="$(readlink -f "$ROOT")"
CURRENT_DIR_NAME="$(basename "$ROOT_REAL")"

ASSUME_YES=false
DELETE_ARCHIVES=true
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    --keep-archives) DELETE_ARCHIVES=false ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--yes] [--keep-archives]" >&2
      exit 2
      ;;
  esac
done

# Stop the standard local stack if it is already running. This does NOT delete the DB volume.
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$ROOT/docker-compose.local.yml" -p mmri-v3-local down >/dev/null 2>&1 || true
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
    sudo docker compose -f "$ROOT/docker-compose.local.yml" -p mmri-v3-local down >/dev/null 2>&1 || true
  fi
fi

search_roots=("$HOME")
[[ -d "$HOME/Downloads" ]] && search_roots+=("$HOME/Downloads")
[[ -d "$HOME/Desktop" ]] && search_roots+=("$HOME/Desktop")

# Deduplicate search roots.
unique_roots=()
for r in "${search_roots[@]}"; do
  rr="$(readlink -f "$r")"
  skip=false
  for u in "${unique_roots[@]:-}"; do
    [[ "$rr" == "$u" ]] && skip=true && break
  done
  $skip || unique_roots+=("$rr")
done

old_dirs=()
old_zips=()
for base in "${unique_roots[@]}"; do
  while IFS= read -r -d '' p; do
    pr="$(readlink -f "$p")"
    [[ "$pr" == "$ROOT_REAL" ]] && continue
    old_dirs+=("$pr")
  done < <(find "$base" -mindepth 1 -maxdepth 1 -type d \
      \( -name 'MMRI_FINAL_FROZEN_MASTER_*' -o -name 'MMRI_R17_*' -o -name 'MMRI_MASTER_CURRENT_*' -o -name 'mmri_clean_work' \) -print0 2>/dev/null)

  if $DELETE_ARCHIVES; then
    while IFS= read -r -d '' p; do
      bn="$(basename "$p")"
      # Protect this release even when the browser renamed it to "...(1).zip".
      if [[ "$bn" == "$CURRENT_DIR_NAME.zip" || "$bn" == "$CURRENT_DIR_NAME"\(*\).zip ]]; then
        continue
      fi
      old_zips+=("$p")
    done < <(find "$base" -mindepth 1 -maxdepth 1 -type f \
      \( -name 'MMRI_FINAL_FROZEN_MASTER_*.zip' -o -name 'MMRI_R17_*.zip' -o -name 'MMRI_MASTER_CURRENT_*.zip' \) -print0 2>/dev/null)
  fi
done

if (( ${#old_dirs[@]} == 0 && ${#old_zips[@]} == 0 )); then
  echo "No previous MMRI release folders/archive files found in ~, ~/Downloads, or ~/Desktop."
  exit 0
fi

echo "Previous MMRI items that will be deleted:"
for p in "${old_dirs[@]}"; do echo "  DIR  $p"; done
for p in "${old_zips[@]}"; do echo "  ZIP  $p"; done

echo
echo "The current release is protected and will NOT be deleted:"
echo "  $ROOT_REAL"
echo

if ! $ASSUME_YES; then
  read -r -p "Delete the listed previous MMRI items? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Cancelled. Nothing was deleted."; exit 0 ;;
  esac
fi

remove_dir() {
  local p="$1"
  if rm -rf -- "$p" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    echo "Permission requires sudo: $p"
    sudo rm -rf -- "$p"
    return 0
  fi
  echo "ERROR: Cannot remove $p because it is not owned by the current user and sudo is unavailable." >&2
  return 1
}

remove_file() {
  local p="$1"
  if rm -f -- "$p" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    echo "Permission requires sudo: $p"
    sudo rm -f -- "$p"
    return 0
  fi
  echo "ERROR: Cannot remove $p because it is not owned by the current user and sudo is unavailable." >&2
  return 1
}

for p in "${old_dirs[@]}"; do remove_dir "$p"; done
for p in "${old_zips[@]}"; do remove_file "$p"; done

echo "Previous MMRI release folders were removed."
if $DELETE_ARCHIVES; then echo "Older MMRI archive files were removed too."; fi
echo "Database volume was preserved. Use ./RESET_LOCAL_DB.sh only if you intentionally want a fresh local database."
