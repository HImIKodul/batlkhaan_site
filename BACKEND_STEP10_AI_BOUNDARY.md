# Backend Step 10/20 — Verified report-data → AI boundary

Status: COMPLETE

## Purpose
Ensure OpenAI can render/explain only an already-frozen MMRI diagnosis/report payload. AI must never calculate, replace, re-rank, or mutate scores, 64-category findings, priorities, recommendations, owners, KPIs, milestones, or the 365-day plan.

## Implemented
- Added `report/integrity.ts` as an independent pre-AI integrity gate.
- Recomputes report payload SHA-256 and diagnosis/strategy/plan binding SHA-256 immediately before provider use.
- Verifies current trace/version/snapshot lineage and canonical finding/action/milestone traces.
- Rejects tampered scores or binding hashes before the provider is called.
- Provider receives a detached recursively frozen report payload.
- OpenAI provider performs its own second integrity check.
- AI input is minimized: no full 64-category dictionary, root-score internals, recommendation scoring components, or trace-index ref metadata.
- AI receives only allowed trace IDs and immutable source hashes.
- Instruction-like company-name content is neutralized in narrative/model input; the authoritative company record remains unchanged.
- Purpose, strength, weakness, priority-action, evidence-action, roadmap, and risk narrative bindings are validated against authoritative order/IDs/traces.
- Executive conclusion is bound to the first authoritative critical action.
- OpenAI Responses storage remains disabled (`store:false`).
- Production OpenAI endpoint is pinned to `https://api.openai.com/v1/responses` to prevent API-key exfiltration by endpoint misconfiguration.
- Current DB AI verifier now checks V4 report snapshots and the findings-policy binding.
- No frontend redesign and no scoring methodology change.

## Release gates
- `npm run backend:step10:ai-boundary:static`
- `npm run backend:step10:ai-boundary:regression`
- `npm run backend:step10:ai-boundary:verify`
- Connected PostgreSQL verification later: `npm run db:verify:ai-report`

## Environment limitation in this chat sandbox
The archive does not include `node_modules`, so full project TypeScript checking reports only missing local Node type declarations (`@types/node`). Modified report TypeScript emitted successfully under the strategy build and no changed report file produced a TypeScript diagnostic. Full dependency-backed build is retained for the later connected Linux gate.
