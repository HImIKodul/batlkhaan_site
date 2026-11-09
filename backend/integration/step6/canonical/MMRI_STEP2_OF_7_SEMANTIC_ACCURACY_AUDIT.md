# MMRI Step 2/7 — Semantic Accuracy Audit

## Scope

- Current five aligned question-bank workbooks.
- Semantic comparison against the frozen BusinessMRI four-domain methodology and the original September 28 frozen exports.
- Focus: whether each question still measures its intended D01–D48 construct and whether its displayed answers logically answer the wording shown to the user.
- Runtime scoring/database behavior is not tested in this step.

## Overall result

- **Marketing:** semantic baseline remains the human-checked reference, with the small residual issues already identified in Step 1.
- **HR / Finance / IT / Operations:** the underlying frozen architecture is semantically sound, but the latest simplified wording package introduced several user-facing question↔answer alignment problems.
- **Do not rebuild the taxonomy or IDs.** The repair is wording-level and answer-label-level, not structural.

## Important correction to Step 1

Step 1 treated the fact that the four rebuilt domains reuse the same answer family across Q1–Q4 as a broad defect. The frozen methodology shows that this reuse is intentional at the canonical answer-mapping level:

- Q1 / A = primary current-state evidence.
- Q2 / B = recent or quantified evidence.
- Q3 / C = independent corroboration; no independent score.
- Q4 / D = conflict resolution; no independent score.
- Canonical answer mappings remain unchanged across the semantic-humanization steps.

Therefore the defect is **not** “all 36,864 Q2–Q4 rows need different scales.” The actual requirement is: **the displayed wording must make the shared canonical scale answer the exact question naturally without changing its mapped meaning.**

## Confirmed semantic strengths

1. **D01 factual applicability is preserved.** The current four-domain banks ask whether the underlying activity/condition exists; they do not use perceived usefulness as the gate.
2. **D06/D15/D16/D18/D28/D41 percentage-band logic remains ordered and complete**, including no-eligible-case states where present.
3. **D41 remains target-relative performance**, not a request for confidential raw amounts.
4. **D42 remains trend context** (improve / stable / worsen / unknown).
5. **D44 remains benchmark context**, including a no-reliable-benchmark state.
6. **D47 and D48 are now meaningfully separated**: D47 measures scaling/repeatability under growth; D48 measures adaptation to changed conditions.
7. **No direct confidential-value collection reappeared** in the current question/answer text.

## High-priority semantic issues

### S2-01 — Specific/latest-event questions paired with habitual answer wording

**Scope:** 24 Q2 dimension templates across HR, Finance, IT and Operations = **6,144 displayed rows requiring review**.

The Q2 question often asks about one latest/specific occurrence, while the displayed answers use habitual wording such as “тогтмол”, “ихэнхдээ”, “заримдаа”, or a general maturity state. This changes the response object from *that event* to *usual behavior*.

Affected dimension templates:
- D01 — Хамааралтай эсэх төлөв
- D02 — Практик / чадавх бодитоор хэрэгждэг эсэх
- D04 — Стратегийн уялдаа
- D05 — Оролцогч тал / үнэ цэнэд хамаарах байдал
- D08 — Удирдлагын дэмжлэг ба sponsorship
- D09 — Шийдвэр гаргах эрхийн тодорхой байдал
- D12 — Засаглалын review cadence-ийн тохироо
- D14 — Баримтжуулалт ба стандартчилал
- D17 — Үйл ажиллагааны cadence-ийн тохироо
- D23 — Нөөц хуваарилалтын үр ашиг
- D24 — Control, compliance ба responsible-use discipline
- D25 — Технологийн дэмжлэгийн түвшин
- D27 — Өгөгдлийн хүртээмж
- D29 — Өгөгдлийн үнэн зөв ба найдвартай байдал
- D30 — Өгөгдлийн freshness / timeliness
- D31 — Өгөгдлийн интеграц ба interoperability
- D32 — Аналитик ба insight гаргах чадавх
- D33 — Insight dissemination
- D34 — Insight-to-decision ашиглалт
- D35 — Туршилт ба баталгаажуулалтын сахилга
- D36 — Суралцах ба тасралтгүй сайжруулах гогцоо
- D40 — Measurement cadence-ийн тохироо
- D45 — End-to-end journey / workflow integration
- D46 — Partner, vendor ба ecosystem effectiveness

Example: `Хамгийн сүүлд энэ ажлыг хийсэн үү?` cannot naturally be answered by `Тийм, тогтмол хийдэг / Зарим тохиолдолд хийдэг / Үгүй, хийдэггүй` because the question is about one occurrence while the choices describe frequency.

**Required repair:** keep the same ordered canonical meaning/value, but rewrite Q2 answer labels into event-specific language.

### S2-02 — Verification/corroboration question form does not match the multi-level state answers

**Scope:** **10,496 rows** detected mechanically in Q3/Q4 across the four domains.

These questions use forms such as `баталж болох уу?`, `батлагдах уу?`, `шалгаж болох уу?` or `батлагдаж байна уу?`, but the answer choices describe the underlying maturity/performance state rather than a yes/partial/no confirmation result.

This does not necessarily require changing the canonical answer family. The safer repair is usually to rewrite the question from a yes/no verification form into an evidence-based state question, for example:

- Current: `Бүртгэлээр бодит багтаамж хүрэлцэж байгааг баталж болох уу?`
- Better semantic form: `Бүртгэлээр харахад бодит багтаамж ямар байна?`

That preserves the answer family (`бүрэн хүрэлцдэг ... хүрэлцдэггүй`) while making the question and scale directly compatible.

### S2-03 — D33 “Insight dissemination” was narrowed too far

**Scope:** D33 across four domains = **1,024 rows**.

The dimension covers dissemination of insights/information to the right people in a timely and understandable form. The current answer family is almost entirely about **timeliness** (`үргэлж цагтаа хүрдэг ... цагтаа хүрдэггүй`). Q1 explicitly also asks whether the information is understandable, so the answer scale no longer covers the full construct.

**Required repair:** answer wording must cover both delivery to the right recipient and usable/understandable delivery, while preserving the existing ordinal mapping.

### S2-04 — D43 lost part of “attribution strength”

**Scope:** D43 across four domains = **1,024 rows**.

The frozen dimension is `Хэмжилтийн хүчин төгөлдөр байдал ба attribution strength`. The current simplified answers focus mainly on whether the measurement is correct/valid and largely omit whether the observed result can be attributed to the intended factor rather than other causes.

**Required repair:** restore the distinction between measurement validity and strength of linkage/attribution without requesting sensitive raw data.

### S2-05 — D32 analytical depth was slightly flattened

**Scope:** D32 across four domains = **1,024 rows**.

The frozen construct distinguishes basic reporting from analysis of causes, trends and likely future outcomes. The current answer wording (`хэрэгжүүлэх боломжтой дүгнэлт`, `хэрэгтэй дүгнэлт`) is easier to read but is less explicit about analytical depth.

**Required repair:** keep simple Mongolian but explicitly preserve the progression from basic description → causal/trend analysis → forward-looking insight.

## Legacy Finance warning

The earlier Finance audit defects around legacy D31 detection ability, D33 escalation, and D43 regular management review **must not be applied to the rebuilt FINMRI by dimension number alone**. The rebuilt BusinessMRI model reused the canonical 48 semantic dimensions, so current FINMRI D31/D33/D43 mean:

- D31 — Өгөгдлийн интеграц ба interoperability
- D33 — Insight dissemination
- D43 — Хэмжилтийн хүчин төгөлдөр байдал ба attribution strength

This is a version-boundary issue: same numeric suffix, different semantic contract.

## What should remain frozen

- Domain IDs and Question IDs
- 64 categories per domain
- D01–D48 positions
- Q1/Q2/Q3/Q4 variant roles
- Answer option order and canonical score/state mapping
- N/A / no-eligible-case / unknown routing semantics
- D41/D42/D44 non-maturity/result-context treatment

## What should change next

1. Rewrite Q2 answer labels for the specific/latest-event templates so they answer the specific event.
2. Rewrite Q3/Q4 evidence questions into state-compatible wording where the answer family is multi-level.
3. Repair D33, D43 and D32 construct coverage.
4. Re-run exact question↔answer compatibility checks after those wording changes.
5. Do not change scoring or IDs during this wording repair.

## Step 2 conclusion

The four rebuilt domain banks are **not semantically broken at the methodology level**. Their frozen architecture was already validated. The current problem is that the later simplification pass made several displayed question/answer pairs less faithful to that architecture. This is repairable without rebuilding any domain.

**Step 2 status: COMPLETE — semantic repair targets isolated.**

### Confidence

- Frozen architecture interpretation: **0.99**
- Identification of Q2 event-vs-habit wording issue: **0.95**
- Verification-form mismatch count: **0.96**
- D33 construct narrowing: **0.97**
- D43 attribution narrowing: **0.94**
- Overall Step 2 conclusion: **0.96**