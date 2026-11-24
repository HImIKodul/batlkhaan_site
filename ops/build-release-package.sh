#!/usr/bin/env bash
# Builds ONE self-contained BusinessMRI release package from clean dependency installs.
# Usage: ops/build-release-package.sh <backend-dir> <frontend-dir> <output-parent-dir> <version-label>
# Output: <output-parent-dir>/businessmri-release-<version-label>/ (+ .zip and .zip.sha256). Refuses to overwrite an existing output.
# Never copies: node_modules, .env files, report-storage (private reports), logs, tests, QA scripts, databases, credentials.
set -euo pipefail
BACKEND=$(readlink -f "$1"); FRONTEND=$(readlink -f "$2"); OUTP=$(readlink -f "$3"); LABEL=$4
OUT="$OUTP/businessmri-release-$LABEL"
[ -e "$OUT" ] && { echo "refusing to overwrite $OUT" >&2; exit 2; }
W=$(mktemp -d "${TMPDIR:-/tmp}/mmri-build.XXXXXX"); trap 'rm -rf "$W"' EXIT
mkdir -p "$OUT"/{backend,frontend,deploy}

echo "[1/6] frontend: clean install + production build"
mkdir "$W/fe"; tar -C "$FRONTEND" --exclude=node_modules --exclude=dist --exclude='.env' --exclude='.env.local' -cf - . | tar -C "$W/fe" -xf -
(cd "$W/fe" && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null)
cp -r "$W/fe/dist" "$OUT/frontend/dist"

echo "[2/6] backend: clean install + production compile"
mkdir "$W/be"; tar -C "$BACKEND" --exclude=node_modules --exclude='dist*' --exclude=report-storage --exclude=methodology --exclude=integration \
  --exclude=tests --exclude=scripts --exclude='*.log' --exclude='.env' --exclude='.env.*' --exclude='STEP07_*.json' -cf - . | tar -C "$W/be" -xf -
(cd "$W/be" && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null)
[ -f "$W/be/dist/api/server.js" ] || { echo "compiled server missing" >&2; exit 3; }

echo "[3/6] backend runtime files"
B="$OUT/backend"
cp -r "$W/be/dist" "$B/dist"; cp "$BACKEND/package.json" "$BACKEND/package-lock.json" "$B/"
cp -r "$BACKEND/prisma" "$B/prisma"; cp -r "$BACKEND/pdf_renderer" "$B/pdf_renderer"; cp -r "$BACKEND/resources" "$B/resources"
rm -f "$B/pdf_renderer/render_report_pdf_b4_proposed.py"
mkdir -p "$B/scripts"; for f in gmail-authorize.mjs qpay-smoke.mjs; do [ -f "$BACKEND/scripts/$f" ] && cp "$BACKEND/scripts/$f" "$B/scripts/"; done
# Only the methodology the runtime/import actually uses (older generations and v2 runtime bundles are NOT shipped).
M="$B/methodology"; mkdir -p "$M"
cp -r "$BACKEND/methodology/domain-question-banks" "$M/"; cp -r "$BACKEND/methodology/recommendation-contracts" "$M/"
TARGET=$(grep -o 'MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json' "$BACKEND/src/methodology-target.ts" | head -n1)
# The four non-marketing domain bundles (exactly the versions pinned in src/domain-methodology.ts) are required to PROVISION a fresh database.
mkdir -p "$M/businessmri-v2.6-runtime-bundles"
for f in MMRI_HRMRI_Methodology_4.1.7 MMRI_FINMRI_Methodology_4.2.7 MMRI_ISMRI_Methodology_4.3.7 MMRI_OPMRI_Methodology_4.4.7; do
  cp "$BACKEND/methodology/businessmri-v2.6-runtime-bundles/${f}_BUSINESSMRI_V2.json" "$M/businessmri-v2.6-runtime-bundles/" || { echo "missing bundle $f" >&2; exit 4; }
done
cp "$BACKEND/methodology/$TARGET" "$M/"; cp "$BACKEND/methodology/PROVENANCE_MANIFEST.sha256" "$BACKEND/methodology/MMRI_QBANK_v3.1.0_FREEZE_MANIFEST.json" "$M/"

echo "[4/6] deploy assets"
REPO=$(dirname "$BACKEND"); HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cp -r "$REPO/deploy/." "$OUT/deploy/"                                  # existing runbooks (Windows, backup/restore, least privilege, observability)
mkdir -p "$OUT/deploy/assets" "$OUT/ops"; cp -r "$HERE/release-assets/." "$OUT/deploy/assets/"
for f in "$HERE"/*.sh "$HERE"/*.mjs; do cp "$f" "$OUT/ops/"; done; cp -r "$HERE/windows" "$OUT/ops/windows"
[ -f "$HERE/release-assets/DEPLOYMENT_RUNBOOK.md" ] && cp "$HERE/release-assets/DEPLOYMENT_RUNBOOK.md" "$OUT/DEPLOYMENT_RUNBOOK.md"
mkdir -p "$OUT/backend/scripts"
cp "$BACKEND/prisma/MIGRATION_CHAIN_SHA256.txt" "$OUT/deploy/MIGRATION_CHAIN_SHA256.txt"
rm -f "$OUT/deploy/LOCAL_POSTGRES_LOOPBACK.md"   # development-container note (old default password, machine paths): never shipped
find "$OUT" -name __pycache__ -prune -exec rm -rf {} +

echo "[5/6] provenance"
# A clean `git archive` extraction has no .git: take the commit from MMRI_BUILD_GIT_HEAD and report the dirty count as null (JSON) instead of failing under pipefail.
GIT=${MMRI_BUILD_GIT_HEAD:-$(git -C "$BACKEND" rev-parse --short HEAD 2>/dev/null || echo unknown)}
if git -C "$BACKEND" rev-parse --git-dir >/dev/null 2>&1; then DIRTY=$(git -C "$BACKEND" status --porcelain 2>/dev/null | wc -l); else DIRTY=null; fi
cat > "$OUT/BUILD_INFO.json" <<EOF
{"product":"BusinessMRI","version":"$LABEL","builtAt":"$(date -u +%FT%TZ)","node":"$(node -v)","npm":"$(npm -v)","gitHead":"$GIT","uncommittedEntries":$DIRTY,"generatorPdf":"MMRI-PDF-1.8-BUSINESSMRI-PLAN"}
EOF
(cd "$OUT" && find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS.txt)

echo "[6/6] archive"
(cd "$OUTP" && rm -f "businessmri-release-$LABEL.zip" && zip -qrX "businessmri-release-$LABEL.zip" "businessmri-release-$LABEL" && sha256sum "businessmri-release-$LABEL.zip" > "businessmri-release-$LABEL.zip.sha256")
echo "done: $OUT"; du -sh "$OUT" "$OUTP/businessmri-release-$LABEL.zip" | cat
