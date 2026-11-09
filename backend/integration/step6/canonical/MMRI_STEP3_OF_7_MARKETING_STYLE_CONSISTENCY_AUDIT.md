# MMRI Step 3/7 — Marketing-Style Consistency Audit

Date: 2026-10-10
Scope: Marketing, HRMRI, FINMRI, ISMRI, OPMRI
Questions reviewed: 61,440
Primary standard: human-audited Marketing wording workbook

## Overall result

- Marketing language pattern: APPROVED AS STYLE STANDARD, with the small residual defects already identified in Step 1.
- HR / Finance / IT / Operations underlying constructs: PRESERVE.
- HR / Finance / IT / Operations wording style: NEEDS TARGETED HUMANIZATION BEFORE FINAL FREEZE.
- Question IDs, category IDs, dimensions, row order, answer order and scoring semantics: DO NOT CHANGE during wording humanization.

## Most important finding

Every one of the 49,152 non-Marketing questions currently contains the capability/category wording mechanically prepended to the question using `—`.

Example:

`Ирээдүйд хэрэгтэй ажиллах хүч, ур чадварыг төлөвлөх — Энэ ажлын зорилго, шийдэх асуудал тодорхой уу?`

The human-checked Marketing standard does not work this way. The topic is expressed naturally inside the question or shown separately in context. The mechanical capability prefix should therefore be removed from the actual customer-visible question stem and retained as a separate category/context field.

After removing that prefix, the four rebuilt domains already have concise question bodies:

| Domain | Current average words including prefix | Average question-body words after prefix removal | Max body words |
|---|---:|---:|---:|
| Marketing | 15.28 | 15.28 | — |
| HR | 19.06 | 12.42 | 20 |
| Finance | 18.82 | 12.41 | 20 |
| IT | 19.08 | 12.42 | 20 |
| Operations | 18.62 | 12.42 | 20 |

This means the four domains do not need to be rewritten from scratch. The base sentence length is already good once mechanical context is separated.

## Human-approved Marketing style contract

### Rule 1 — One question = one observable point
Do not combine two separate judgments in one sentence. The user should be able to answer the question without interpreting a methodology term.

### Rule 2 — Ask directly
Prefer natural verbs such as:
- `хийдэг үү?`
- `шалгадаг уу?`
- `харж болдог уу?`
- `тодорхой байдаг уу?`
- `хүрдэг үү?`
- `ашигладаг уу?`

Avoid bureaucratic constructions when the same fact can be asked directly.

### Rule 3 — Do not mechanically copy the capability name into the question
The capability/category is context, not part of every sentence.

Bad:
`Мэдээлэл ба өгөгдлийн стратеги — Холбогдох өгөгдөл...`

Preferred UI structure:
`Context: Мэдээлэл ба өгөгдлийн стратеги`
`Question: Холбогдох өгөгдөл, системүүд хоорондоо найдвартай холбогддог уу?`

### Rule 4 — Keep diagnostic specificity mainly in the answers
The question should be understandable at first reading. Detailed percentages, bands, exceptions and states belong primarily in answer choices when the construct permits it.

### Rule 5 — Variant A / Q1
Ask the present/current-state construct directly and naturally.

### Rule 6 — Variant B / Q2
Ask about recent or quantified evidence without sounding like a generic template. If it refers to the latest case, use past tense and make the answer wording compatible with that specific case.

### Rule 7 — Variant C / Q3
Preserve independent corroboration, but phrase it naturally. Prefer wording such as:
- `Бүртгэлээс ... харагддаг уу?`
- `Өөр эх сурвалжаар шалгаж болдог уу?`
- `Баримт, бүртгэлтэй таарч байна уу?`

Avoid repeating formal phrases such as `... нь батлагдах уу?` when a simpler expression carries the same meaning.

### Rule 8 — Variant D / Q4
Keep conflict-resolution neutral. Do not assume that a contradiction exists before the user has established one.

Avoid:
`... дээр зөрүү байвал ...`

Prefer a neutral structure such as:
`Нэмэлт мэдээллийг шалгахад өмнөх мэдээлэл хоорондоо таарч байна уу?`

The exact wording must remain specific to the assigned construct.

### Rule 9 — Avoid unnecessary technical/robotic wording
Use technical terminology only when it is necessary to preserve the construct.

Priority phrases to simplify:
- `батлагдах / баталж болох`
- `зөрүү байвал`
- `тулгахад / тулгалт`
- `эх өгөгдөл`
- `тайлант хугацаа`
- `цагийн тэмдэглэгээ`
- `нэг утгаар тогтоох`
- `хамгийн сүүлийн хүчинтэй ...`

`бодит` is not prohibited, but it should be used only when the distinction between an actual event and a plan/claim matters.

### Rule 10 — Preserve methodology while humanizing language
Do not change:
- target dimension;
- A/B/C/D evidence role;
- answer ordering;
- canonical scoring/state mapping;
- applicability logic;
- normalization;
- dependencies;
- question IDs.

## Quantified style differences

### Mechanical capability prefix

| Domain | Rows with mechanical `Capability — Question` structure |
|---|---:|
| HR | 12,288 |
| Finance | 12,288 |
| IT | 12,288 |
| Operations | 12,288 |
| Total | 49,152 |

Marketing: 0.

### High-priority robotic wording rows

Rows containing at least one of the main robotic/evidence phrases (`батлагдах`, `зөрүү`, `тулгахад`, `эх өгөгдөл`, `тайлант хугацаа`, `цагийн тэмдэглэгээ`, `нэг утгаар тогтоох`, `хамгийн сүүлийн хүчинтэй`):

| Domain | Rows | Share of domain |
|---|---:|---:|
| HR | 5,421 | 44.1% |
| Finance | 5,421 | 44.1% |
| IT | 5,312 | 43.2% |
| Operations | 5,421 | 44.1% |

Marketing contains none of these specific patterns.

### Phrase-level counts

| Phrase family | HR | Finance | IT | Operations |
|---|---:|---:|---:|---:|
| `батлах / батлагдах` | 2,880 | 2,880 | 2,880 | 3,027 |
| `зөрүү` | 2,334 | 2,334 | 2,176 | 2,176 |
| `тулгах / тулгалт` | 704 | 704 | 704 | 704 |
| `эх өгөгдөл` | 128 | 128 | 128 | 128 |
| `тайлант хугацаа` | 64 | 64 | 64 | 64 |
| `цагийн тэмдэглэгээ` | 256 | 256 | 256 | 256 |
| `нэг утгаар тогтоох` | 192 | 192 | 192 | 192 |

These counts overlap; they must not be summed as unique defective rows.

## Examples of the required style direction

### Current Q3
`Төлөвлөгөө, шийдвэрийн үндэслэл эсвэл тайлангаар бизнесийн зорилготой уялдсан нь батлагдах уу?`

### Marketing-style direction
`Төлөвлөгөө, шийдвэр, тайлангаас бизнесийн зорилготой хэрхэн уялдсаныг харж болдог уу?`

The exact final answer must still preserve the frozen corroboration meaning.

### Current Q4
`Уялдааны талаар зөрүү байвал хамгийн сүүлийн шийдвэрийн үндэслэл бизнесийн зорилготой холбоотой байсан уу?`

### Marketing-style direction
`Нэмэлт мэдээллийг шалгахад тухайн шийдвэр бизнесийн зорилготой холбоотой байсан нь тодорхой байна уу?`

This removes the assumption that a contradiction already exists.

### Current data-integration Q3
`Холболтын хоёр талаас эх өгөгдөл, түлхүүр, тодорхойлолтыг тулгахад мэдээлэл нийцэж байна уу?`

### Marketing-style direction
`Хоёр системийн ижил мэдээллийг харьцуулахад хоорондоо таарч байна уу?`

This is simpler while preserving the observable fact.

## Important methodological boundary

Marketing is the language/style standard, not the scoring-template standard for the four rebuilt MRIs.

The rebuilt BusinessMRI methodology intentionally uses:
- A = primary current-state evidence;
- B = recent/quantified direct evidence;
- C = independent corroboration;
- D = conflict resolution.

Therefore the four domains should sound like Marketing, but their Q3/Q4 semantic roles must remain the rebuilt BusinessMRI roles rather than being copied literally from Marketing's older engine.

## Step 3 decision

The final wording repair should use the following sequence:

1. Remove capability-name prefixes from all 49,152 non-Marketing question stems; retain capability/context separately.
2. Preserve the already concise body questions where they are natural.
3. Humanize the ~5.3k–5.4k high-priority technical rows in each domain.
4. Repair Q2 tense/answer-fit issues identified in Step 2.
5. Rewrite C/Q3 and D/Q4 phrasing into plain Mongolian while preserving corroboration/conflict-resolution semantics.
6. Apply the Step 2 construct corrections for D32, D33 and D43.
7. Run final Mongolian grammar, punctuation, terminology and question-answer-fit QA.

## Status after Step 3/7

- Structural architecture: PASS / frozen.
- Marketing style standard: DEFINED.
- Four-domain style transformation rules: DEFINED.
- Exact high-priority wording scope: QUANTIFIED.
- Ready for Step 4 integration-ready canonical data build: YES.

Confidence: 0.97.
