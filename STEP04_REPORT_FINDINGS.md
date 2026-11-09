# Step 04 / 10 — Report findings selection and concise capability help

This step is intentionally limited to the report's 5 strongest / 5 weakest capability selection and the explanatory hover text.

## Implemented

- Report findings are selected from the canonical 64-capability result set for the active domain.
- Missing/unscored capability values are excluded instead of being converted to false zero scores.
- Exactly five strongest and five weakest capabilities are selected when a completed result contains the expected 64 scored capabilities.
- Strong and weak lists are kept distinct when at least 10 scored capabilities are available.
- Equal-score ties are deterministic. Tie priority is:
  1. canonical diagnostic capability weight,
  2. amount of finalized diagnostic evidence,
  3. relevance/structural mass across the five purposes,
  4. confidence,
  5. coverage,
  6. canonical 64-capability order,
  7. stable capability ID.
- Demo reports use the same end-selection function. Because demo rows do not carry production evidence/weight metadata, exact score ties fall back to canonical capability order rather than invented metadata.
- Capability hover/focus help contains only the meaning sentence. The capability name is not repeated inside the tooltip.
- The extra five-purpose score strip below the strength/weakness area was removed from both the screen report and PDF page 1.
- The 365-day plan, scoring engine, question banks, payment logic and database were not modified.

## Important behavior

A completed production diagnosis should contain the full scored capability set. If malformed/incomplete data somehow contains fewer scored capabilities, the UI does not invent zero scores merely to fill the list.
