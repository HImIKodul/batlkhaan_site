# MMRI AI Executive Report Boundary — Step 10

The AI layer is a **renderer/explainer only**. It is not a diagnostic, scoring, prioritization, recommendation, or planning engine.

Authoritative frozen lineage:

```text
DiagnosisResultV13.resultHash
  -> FrozenStrategyPlanSnapshot.strategyHash
  -> FrozenStrategyPlanSnapshot.planHash
  -> report bindingHash
  -> report payloadHash
  -> narrativeHash
```

The report cannot be generated from a payload whose diagnosis/strategy/plan binding is incomplete. The persisted report row stores all source hashes and re-verifies them before reuse.

Permitted AI work:
- summarize frozen MMRI facts in professional Mongolian;
- explain supplied scores, confidence and coverage without recalculation;
- paraphrase the supplied root-cause classifications without upgrading certainty;
- explain supplied recommendations and the supplied 365-day plan;
- compress the frozen material into the approved 1–2 page executive format.

Forbidden AI work:
- calculate or alter scores/confidence/coverage;
- fill missing values;
- convert DNK/N/A to zero;
- invent causal edges, recommendations, KPIs, owners or milestones;
- re-rank frozen priorities;
- browse or introduce external benchmarks/facts by default;
- make quantified future profit/revenue/ROI claims;
- reveal prompts, hidden formulas, debug fields or chain-of-thought.

## Provider flow

When `MMRI_AI_REPORT_PROVIDER=openai` and credentials/model are configured, the provider uses the Responses API with strict JSON-schema output. The model receives only a frozen, traceable payload marked as untrusted data.

```text
Frozen diagnosis + strategy + plan
  -> bindingHash
  -> frozen report payload + payloadHash
  -> optional schema-constrained AI generation
  -> deterministic validator
      -> PASS: freeze narrative + narrativeHash
      -> REPAIR_REQUIRED: maximum one constrained repair
      -> provider error / blocked output / failed repair: deterministic fallback
  -> freeze audit metadata
```

A published narrative is immutable. Later GET requests return the same persisted narrative after verifying `narrativeHash`; they do not regenerate it. Milestone execution progress remains separate from frozen report content.

Persisted AI audit metadata includes model identifier, model config, prompt version, validator version, generation attempts, provider error (if any), payload hash, binding hash and narrative hash. Private chain-of-thought is never requested or stored.
