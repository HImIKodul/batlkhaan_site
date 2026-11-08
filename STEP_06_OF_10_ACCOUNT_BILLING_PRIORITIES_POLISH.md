# Step 6/10 — Login + Billing + Profile + Settings + Priorities final polish

Status: PASS

## Main improvements
- Billing-plan metadata is no longer Marketing-only and no longer advertises the obsolete two-page report; it now reflects a selected-domain diagnosis and the current 3-page PDF report.
- Login now shows a compact premium value proof, current selected-plan price, and clearer registration password guidance.
- Billing adds a three-stage payment-state indicator, normalizes an invalid stored domain before API use, announces errors accessibly, adds a close control to the success dialog, and clarifies automatic status checking.
- Profile completion counts use the real basic-question count instead of hard-coded `20/20`; empty company-name saves now surface an error instead of silently doing nothing; save success is announced.
- Settings no longer labels unknown legacy invoices as Marketing; native switches expose accessible switch semantics; logout is separated from visual preferences.
- Priorities removes score arrows, uses explicit `Одоо / зорилт` labels, removes Marketing-only fallback wording, and removes stale Strategy-domain wording from demo/role copy.
- Secondary account/profile/payment surfaces received restrained glass/touch/mobile refinement without adding another override layer.

## Validation
- UI/static contract: 95/95 PASS.
- Frontend TS/TSX syntax parse: 37 files, 0 errors.
- Active CSS structural validation: PASS.
- ReportLab renderer Python compile: PASS.

No scoring, adaptive routing, payment amount, payment provider behavior, database schema, question-bank data, findings logic, or PDF page contract changed in this step.
