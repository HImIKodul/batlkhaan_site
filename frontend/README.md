# MMRI Frontend v1.16

Customer-facing MMRI frontend implemented page by page against the frozen Menyan design references.

Frozen pages:
- Homepage v1.10
- Company/Profile v1.11
- Unified Diagnostic Workspace v1.12
- Strategic Priorities v1.13
- 365-Day Plan v1.14
- History / Reassessment v1.15

Current freeze candidate:
- Executive Report v1.16 — two-page Executive Summary

Canonical routes:
- `#/`
- `#/company`
- `#/diagnosis` (internally mapped to the existing Results component)
- `#/plan`
- `#/history`
- `#/report`

The production report uses the server-validated frozen report snapshot. Public pages use clearly labelled demonstration data only.

## Step 20 integration note — v3.8.0
The frozen three-section frontend is now covered by `scripts/step20-live-fullstack-gate.sh`, which verifies the real Vite frontend against the real API and disposable PostgreSQL/Prisma database in a connected integration environment. See `STEP_20_FULLSTACK_INTEGRATION_CONTRACT_v3.8.md`.
