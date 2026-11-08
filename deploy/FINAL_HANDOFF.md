# MMRI Final Engineering Handoff — Step 15/15

## Product
MMRI is a Marketing diagnostic platform built around **64 categories × 48 diagnostic cells = 3,072 cells** and a governed **12,288-question** bank. The adaptive assessment selects only the evidence needed for the company/profile rather than exposing the whole bank.

## Frozen diagnostic identity
- Question Bank: **v3.1.0**.
- Questions: **12,288**.
- Stable question-array SHA-256: `264186715faffcbcc1cfe63529907c4b70c9eb0cdf06e1771fb57f9210ec3a26`.
- Runtime methodology: **v3.0.0**.
- Runtime methodology bundle SHA-256: `2dab0a3b313d018bc57f28f798b92a31738e4b33e99f3e7adc5e9422fc8b9ed0`.

## Certified engineering chain
Question → issued question → immutable accepted AnswerEvent → cell value/confidence → category/module/purpose results → diagnosis/root hypotheses → recommendations → 365-day milestones → immutable result/report snapshot → factual report claims with canonical provenance.

Persistence includes revision guards, idempotent accepted-answer writes, single-writer lease protection, exact save/resume restoration, acknowledged drafts, immutable answer events and immutable terminal snapshots.

Security includes tenant isolation, least-privilege RBAC, separate assessor/consultant privileges, rotating replay-protected refresh sessions, production origin/cookie/secret validation, abuse limits, security headers and final-owner protection.

Operations include `/live`, database/drain-aware `/ready`, `/health`, protected Prometheus `/metrics`, migration-first startup, immutable image policy, least-privilege containers, strict preflight, PostgreSQL/report-storage backup + checksum metadata, destructive-restore guards, smoke/load hooks and deployment rollback documentation.

## Runtime stack
- Frontend: React + TypeScript + Vite.
- API: Node.js + TypeScript.
- Persistence: PostgreSQL + Prisma.
- Authentication: short-lived access tokens + rotating refresh sessions.
- Billing: server-side QPay integration path with entitlement gating.
- AI report: controlled provider boundary with deterministic fallback.

## Source certification
Run from the repository root:

```bash
bash ops/final-release-gate.sh
```

Default mode is source-only and must end with engineering RC status plus explicit HOLDs for unavailable connected gates.

## Connected certification
For the connected gate, provide exact npm lockfiles, installed dependencies, a disposable PostgreSQL database and the production-like environment/tooling required by the operations/security gates. Then run:

```bash
MMRI_FINAL_LIVE_GATE=YES DATABASE_URL='postgresql://...' bash ops/final-release-gate.sh
```

Never point destructive integration/reset/restore commands at production data.

## Release boundary
The Step-15 package is the final engineering handoff. Public rollout remains a separate decision requiring connected runtime evidence and any required provider/field-validation evidence. Engineering completion must not be presented as empirical, predictive or causal validation.
