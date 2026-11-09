# Step 03/10 — Answer color interpolation

Scope is limited to scored diagnostic-answer presentation. Question wording, answer values, scoring rules, routing, methodology and the 365-day plan are unchanged.

## Final color rule
The answer color is derived from answer quality/score on one continuous scale:

- 100% / best: green `rgb(25 134 95)`
- 75%: exact green-yellow midpoint `rgb(118 156 48)`
- 50%: yellow `rgb(211 177 0)`
- 25%: exact yellow-red midpoint `rgb(205 120 25)`
- 0% / worst: red `rgb(198 62 50)`

For a four-answer positional scale the normalized positions are 1, 2/3, 1/3, 0, so the two middle answers are automatically a green-yellow mixture and a yellow-red mixture.

## Behavior by option count
- 2 scored answers: green → red
- 3 scored answers: green → yellow → red
- 4 scored answers: green → green/yellow mixture → yellow/red mixture → red
- 5 scored answers: green → green/yellow mixture → yellow → yellow/red mixture → red
- 6+ scored answers: evenly interpolated across the same green → yellow → red scale

The packaged live banks currently contain 3–7 answer-option structures depending on the domain/question type; the same interpolation function covers all of them.

## Important conditions
- When numeric scores exist, color follows the actual normalized score rather than DOM position.
- When numeric scores are unavailable, the same scale is distributed evenly by semantic answer order.
- Neutral/non-scoring answers such as “Мэдэхгүй” and “Хариулах мэдээлэл алга” remain gray and are excluded from the scored gradient.
- If all scored values are genuinely equal, they all use the midpoint yellow rather than inventing a false better/worse hierarchy.
- The 20 factual business-profile questions remain neutral because they describe the organization and are not good/bad diagnostic scores.

## Not changed
- Homepage radar/status (Step 02 remains intact).
- Question-bank content or answer scoring values.
- Routing/calculation methodology.
- Report logic or PDF.
- Settings/dark mode.
- 365-day plan.
