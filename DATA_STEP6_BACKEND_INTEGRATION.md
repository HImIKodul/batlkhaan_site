# MMRI Data Track Step 6/7 — Backend Integration Contract & Runtime Reconciliation

**Status:** `COMPLETE — READY FOR STEP 7 IMPLEMENTATION, NOT PRODUCTION ACTIVATION`  
**Authoritative system:** `MMRI_FINAL_FROZEN_MASTER_v3.1.16_R17_21_4_STEP08_RESPONSIVE_GLOBAL_LINUX_2026-10-10.zip`  
**System ZIP SHA-256:** `018dd7499039f0a404212603c9a950f8d1eaa8882b15b81e1cc0d0a14f9fabdb`  
**Canonical content SHA-256:** `34337d26022965045515d57030ba1f1d2b01a1df5642c77a87d2890a12acac25`

## What Step 6 verified

- The current live assessment runtime is still the Marketing methodology `3.0.0` bound to Question Bank `3.1.0`, with 64 categories, 3,072 cells and 12,288 questions.
- The legacy non-Marketing loader points to IT 3,072, Finance 12,288, HR 3,072 and Operations 3,072-question repaired banks. It has **no call sites outside its own loader file**, so those banks are not the live multi-domain assessment engine.
- The live frontend explicitly keeps every non-Marketing domain locked and creates a real assessment only for `marketing`.
- `BillingInvoice`, `CompanyEntitlement` and `Assessment` currently have no persistent `domainCode`. Therefore secure five-domain paid activation requires a Step 7 schema/API change.
- All 61,440 canonical QuestionIDs were reconciled. Marketing has 12,288/12,288 exact ID matches to the active bundle, but 0 exact question-text matches and 0 exact answer-set matches because the canonical wording set is a different content version. No in-place Marketing overwrite is allowed.
- The other 49,152 canonical QuestionIDs have no exact ID match in the current legacy non-Marketing runtime banks. They require four new versioned runtime methodology bundles; positional mapping is forbidden.

## Fixed backend integration architecture

- Keep current Marketing runtime unchanged.
- Create one domain-scoped methodology bundle for each of HRMRI, FINMRI, ISMRI and OPMRI.
- Add an explicit persistent domain identity to invoice → entitlement → assessment → methodology/report trace.
- Preserve canonical QuestionID/CategoryID/DimensionID/Variant identity.
- Map every answer to explicit runtime score/state/evidence policy. Never infer scoring from answer order.
- Q3/Q4 are evidence/corroboration/conflict paths and cannot create a duplicate maturity score.
- Non-Marketing five-goal aggregation keeps a 20% baseline per goal before valid N/A re-normalization.

## Step 6 boundary

No production runtime file, Marketing engine, database schema, payment flow or frontend behavior was changed. This is intentional. Step 6 freezes the **correct integration contract and exact runtime gaps**. Step 7 is the implementation/activation gate.

## Main evidence files

- `backend/integration/step6/MMRI_STEP6_OF_7_RUNTIME_RECONCILIATION.json`
- `backend/integration/step6/MMRI_STEP6_OF_7_QUESTION_ID_RECONCILIATION.csv`
- `backend/integration/step6/MMRI_STEP6_OF_7_ACTIVATION_GATE_MATRIX.csv`
- `backend/integration/step6/MMRI_STEP6_OF_7_REQUIRED_STEP7_SCHEMA_API_PLAN.md`
- `backend/integration/step6/canonical/` — frozen Step 4/5 canonical source and lineage files

## Verification

Run from the extracted root:

```bash
chmod +x VERIFY_DATA_STEP6_BACKEND_INTEGRATION.sh
./VERIFY_DATA_STEP6_BACKEND_INTEGRATION.sh
```

The verifier checks canonical counts/hashes, the 61,440 reconciliation rows, the current runtime facts, and byte-preservation of every pre-existing R17.21.4 Step08 file.
