# Backend completion Step 16/20 — failure and recovery hardening

Status: COMPLETE
Date: 2026-10-25
Frontend redesign: NONE
Database migration: NONE

## Recovery guarantees hardened

1. Interrupted diagnosis writes remain transaction-safe; accepted answers/drafts survive process restarts.
2. Exact answer retries remain idempotent; changed payload reuse with the same request id is rejected.
3. Paused diagnoses preserve the exact resume pointer and draft; stale writer leases can expire normally.
4. Paid entitlements stranded by a crash between claim and assessment creation are automatically reopened after a bounded safety window, but only when no assessment is linked and the source invoice is PAID.
5. Local invoices stranded in CREATED before a provider invoice id is persisted are marked FAILED after a bounded safety window so a clean replacement invoice can be created.
6. PENDING/provider-backed and PAID invoices are never reset by interrupted-invoice recovery.
7. Temporary payment verification outages leave invoices pending; later reconciliation may settle them safely.
8. Expired report-generation leases are reclaimable; live leases still prevent duplicate publishers.
9. Report generation failure preserves an already-published report; first-time failure remains retryable from GENERATION_BLOCKED.
10. PDF artifacts are verified by size/hash, missing or corrupt files regenerate from the immutable report source, and all PDF work for one report is serialized to prevent force/normal races.
11. PDF replacement remains staged + atomic and same-source nondeterministic output fails closed.

## New optional environment controls

- MMRI_BILLING_INTERRUPTED_INVOICE_RECOVERY_MS=300000
- MMRI_ENTITLEMENT_ORPHAN_RECOVERY_MS=120000

Both are bounded to 60,000–3,600,000 ms.

## Verification

- Step 16 static recovery gate: 25/25 PASS
- Step 16 failure/restart simulation: 24/24 PASS
- Step 15 full five-domain E2E: 86/86 PASS
- Step 13 payment static: 27/27 PASS
- Step 13 provider runtime: 10/10 PASS
- Step 12 PDF static: 17/17 PASS
- Step 12 PDF deterministic runtime: 9/9 PASS
- Step 11 AI reliability static/runtime: PASS
- Persistence runtime: 30/30 PASS
- Traceability runtime: 30/30 PASS
- Security runtime: 38/38 PASS
- API static: PASS — 75 routes
- Changed TypeScript transpilation: PASS
- Credential scan: PASS

## Connected environment still required later

The final connected PostgreSQL/DigitalOcean gate must still execute the previously prepared migrations and verify restart/recovery behavior against the real database and persistent report-storage volume.
