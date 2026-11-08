# MMRI Step 1/7 — Full Five-Domain Question-Bank Audit

## Overall result

- Structural completeness: **PASS**
- Marketing wording: **Strong but 131 confirmed residual issues remain**
- HR / Finance / IT / Operations wording: **NOT FINAL YET**
- Total questions audited: **61,440**
- Potential semantic Q/A mismatches flagged: **14,615**
- Technical/legacy wording flags: **22,587**

## Domain metrics

| Domain | Categories | Questions | Unique IDs | Blank Q | Blank A | Latin Q/A | Duplicate answer rows | Q1–Q4 answer pattern |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Marketing | 64 | 12288 | 12288 | 0 | 0 | 0 | 0 | 45 dims with 4 distinct; 0 dims with 1 shared |
| HR | 64 | 12288 | 12288 | 0 | 0 | 0 | 0 | 0 dims with 4 distinct; 48 dims with 1 shared |
| Finance | 64 | 12288 | 12288 | 0 | 0 | 0 | 0 | 0 dims with 4 distinct; 48 dims with 1 shared |
| IT | 64 | 12288 | 12288 | 0 | 0 | 0 | 0 | 0 dims with 4 distinct; 48 dims with 1 shared |
| Operations | 64 | 12288 | 12288 | 0 | 0 | 0 | 0 | 0 dims with 4 distinct; 48 dims with 1 shared |

## Confirmed findings

### PASS — Structural completeness
**Scope:** All 5 domains  
**Evidence:** Each domain has 64 categories, 12,288 questions, 12,288 unique Question IDs, complete D01–D48 × Q1–Q4 grids, and no blank question/answer cells.  
**Affected:** 0 structural defects  
**Action:** Keep IDs/category/dimension grid frozen.

### CRITICAL — Variant-specific answer pattern not transferred
**Scope:** HR, Finance, IT, Operations  
**Evidence:** Human-checked Marketing uses 4 distinct answer sets across Q1–Q4 in 45/48 dimensions (plus 2 or 3 sets in the remaining 3). Each of the other four domains uses exactly 1 shared answer set across Q1–Q4 in all 48 dimensions.  
**Affected:** 36,864 Q2–Q4 rows are potentially affected (4 domains × 64 categories × 48 dimensions × 3 variants).  
**Action:** Rewrite Q2/Q3/Q4 answer choices variant-by-variant using Marketing as the language/logic pattern; preserve IDs and construct meaning.

### HIGH — Evidence/verification question → performance-scale answer mismatch
**Scope:** HR, Finance, IT, Operations  
**Evidence:** Automated semantic screen found 14,615 rows where the question asks for confirmation/evidence/checking but the answers describe the underlying capability level instead of the evidence/check outcome. Example: '...бүртгэл, системээс баталж болох уу?' → 'Хамаарна / нөхцөл байхгүй / мэдэхгүй'.  
**Affected:** 14,615 potential rows; requires template-level semantic review rather than blind bulk replacement.  
**Action:** For each D01–D48 variant, make the answers directly answer the wording of that variant.

### HIGH — Legacy/technical wording remains
**Scope:** HR, Finance, IT, Operations  
**Evidence:** Marketing has technical/legacy phrase flags in 1.6% of rows; HR/Finance/IT ~46.2%, Operations ~45.3%. Common phrases include 'тулгахад', 'зөрүү байвал', 'батлагдах', 'тайлант хугацаа', 'эх өгөгдөл', 'цагийн тэмдэглэгээ'.  
**Affected:** ~5,568–5,673 rows per non-Marketing domain.  
**Action:** Simplify to the direct human Marketing style while retaining the intended fact being measured.

### MEDIUM — Residual punctuation errors
**Scope:** Marketing  
**Evidence:** 127 answer rows still contain double punctuation ('..'). They concentrate in D05-Q4 (63 rows), D24-Q2 (63 rows), and D04-Q4 (1 row).  
**Affected:** 127 rows  
**Action:** Mechanical cleanup only; no semantic change.

### MEDIUM — Residual capitalization error
**Scope:** Marketing  
**Evidence:** MMRI-C01-D31-Q2 contains 'Байнга Гараар оруулдаг.'  
**Affected:** 1 row  
**Action:** Change 'Гараар' → 'гараар'.

### HIGH — D42 C01 trend scale is incomplete/overlapping
**Scope:** Marketing  
**Evidence:** MMRI-C01-D42-Q1/Q2/Q4 use 'Өөрчлөгдөөгүй' and 'Ойролцоогоор хэвээр' together but omit a negative trend ('Муудаж байна').  
**Affected:** 3 rows  
**Action:** Make the trend scale mutually exclusive and cover decline / stable / improve / unknown.

### PASS — No direct sensitive exact-value prompts detected
**Scope:** All 5 domains  
**Evidence:** Targeted scan found no direct requests for salary amount, revenue amount, bank-account balance/number, personal ID, phone/address, password, or named employee/customer data.  
**Affected:** 0 detected  
**Action:** Keep the privacy guardrail in later semantic review.

## Key conclusion

The five banks are structurally complete, but the four non-Marketing wording files should not yet be treated as final production wording. The human-checked Marketing bank uses variant-specific question-and-answer wording, while the other four currently reuse one answer scale across Q1–Q4 for every dimension. Step 2 should repair this variant-specific answer alignment while preserving IDs, category structure, dimensions, and diagnostic meaning.
