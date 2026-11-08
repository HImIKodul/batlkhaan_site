# Step 10/12 — Mongolian wording integration

Status: **STATIC INTEGRATION PASS — runtime regression pending Step 11.**

Integrated targets:

- Marketing: methodology `3.0.1`, question bank `3.1.1`, engine remains `MARKETING_V3`.
- Human Resources: `4.1.1`, engine remains `BUSINESSMRI_V2`.
- Finance: `4.2.1`, engine remains `BUSINESSMRI_V2`.
- Information Technology: `4.3.1`, engine remains `BUSINESSMRI_V2`.
- Production & Operations: `4.4.1`, engine remains `BUSINESSMRI_V2`.

The new versions contain the Step-9 verified 61,440-row Mongolian wording payload. IDs, option ordering, scores, runtime states, weights, routing policies, and scoring eligibility remain unchanged from the previous active runtime versions.

The previous runtime files remain packaged unchanged for rollback. Promotion archives the prior active version instead of deleting it.

## Separate question context

The questionnaire now returns and renders the category context separately as `contextMn`. It is displayed above the question and is never concatenated with an em dash. This is required for the 6,144 generic-context question stems identified in Step 9.

## Verification

```bash
./VERIFY_STEP10_MONGOLIAN_WORDING_INTEGRATION.sh
```

Step 10 is not the final production freeze. Step 11 must execute the full runtime regression; Step 12 will create the final frozen archive and hashes.
