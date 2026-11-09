# MMRI BUILD FIX 2 — 2026-10-10

Fixes Vite/Rollup production build failure caused by an invalid Unicode regular-expression identity escape in `frontend/src/pages/Report.tsx`.

Changed:
- `replace(/^\"[^\"]+\"\s*гэдэг нь\s*/u,'')`
- to `replace(/^"[^"]+"\s*гэдэг нь\s*/u,'')`

No methodology, scoring, question-bank, payment, report, or UI-layout semantics were changed.

Verification after patch:
- `./VERIFY_LINUX_PACKAGE.sh` — PASS
- `./VERIFY_DATA_STEP7_FINAL.sh` — PASS
- `./VERIFY_STEP08_RESPONSIVE_GLOBAL.sh` — PASS
