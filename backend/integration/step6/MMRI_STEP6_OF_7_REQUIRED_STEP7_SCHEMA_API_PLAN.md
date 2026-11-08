# MMRI Step 6/7 — Required Step 7 Domain-Scoped Persistence/API Plan

This file is a design contract, not an applied migration. The authoritative R17.21.4 Step08 schema is left unchanged in Step 6.

## Why a migration is required

The current paid entitlement is company + plan scoped, not domain scoped. A paid Marketing entitlement could therefore be claimed without a persistent backend field proving that it belongs to Marketing. The frontend currently prevents this for non-Marketing only by keeping those domains locked; that is not an acceptable production authorization boundary.

## Required persistent domain identity

Use one stable enum/value set across API, billing, assessments and reports:

- `MARKETING`
- `ISMRI`
- `FINMRI`
- `HRMRI`
- `OPMRI`

Required Step 7 persistence additions:

1. `BillingInvoice.domainCode` — the diagnosis purchased.
2. `CompanyEntitlement.domainCode` — copied from the paid invoice and immutable.
3. `Assessment.domainCode` — copied from the claimed entitlement and immutable.
4. Optional but recommended `MethodologyVersion.domainCode` — makes the methodology→domain binding queryable and auditable.

## Required API contract

- Invoice creation requires `domainCode`; price remains 300,000₮ for first diagnosis and retake.
- Entitlement claim filters by `companyId + domainCode + ACTIVE + unused`.
- Assessment creation requires `domainCode`; it must reject an entitlement for another domain.
- The selected methodology bundle must be bound to the same domain.
- Existing Marketing assessments remain pinned to methodology `3.0.0` / Question Bank `3.1.0`.

## Methodology isolation

Do **not** combine all 320 categories into one assessment methodology and then filter them at runtime. Create one independently versioned methodology bundle for each paid diagnosis. This preserves separate payments, separate progress, separate reports, separate retakes and simpler rollback.

## No positional mapping

The four current repaired non-Marketing files are legacy content models. The canonical 49,152 non-Marketing QuestionIDs have zero exact ID matches to those legacy runtime files. They must be imported as new versioned definitions with explicit option state/score/evidence policies.
