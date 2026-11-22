# Administrator-grant pilot mode (`MMRI_BILLING_PROVIDER=grant`)

Purpose: a controlled, time-boxed internal pilot in which **no payment is collected**. Customers get diagnosis access only when an administrator grants it. QPay and manual-payment code are unchanged and remain available by selecting another provider.

## Required settings (all in the backend environment file)
| Variable | Rule | Who supplies it |
|---|---|---|
| `MMRI_BILLING_PROVIDER` | `grant` | release owner |
| `MMRI_BILLING_ENFORCEMENT` | `true` — the API refuses to start otherwise (without it diagnosis access would be free for everyone) | release owner |
| `MMRI_PILOT_GRANT_AUTHORIZED_BY` | 3–120 characters, one line: the person (and reference) that authorised the pilot, e.g. a name plus the written-approval reference | **the owner decides the text; it is not generated or defaulted** |
| `MMRI_PILOT_GRANT_EXPIRES` | ISO date-time, **at most 120 days ahead**; in production a past value stops the API from starting | **the owner decides the date** |
| `MMRI_AI_REPORT_REQUIRED` | `true` (fail-closed reports; see below) | release owner |
| `MMRI_OPERATOR_USER_IDS` | not used by grant mode (it is for manual payments). Administrators are separate accounts created with `admin-cli bootstrap`; **no administrator ID is defined in the repository and none should be invented** | — |

`ops/preflight.mjs` enforces the same rules (verified: missing values, a past date, a date beyond 120 days and an unparsable date are each rejected; a valid +60-day setting passes the pilot checks).

## Behaviour
- Customers cannot create invoices or use the test-payment endpoint: HTTP 409 `PILOT_GRANT_ONLY` / 404. No invoice rows or revenue are produced.
- Access = an `ADMIN_GRANT` entitlement created through the existing administrator route `POST /admin/companies/:id/entitlements/grant` (permission `accounts.manage`, fresh password + TOTP re-authentication). In grant mode the request must also carry `authorizationRef` (4–120 characters). The grant reason must be at least 8 characters.
- Each grant is audited (`ADMIN_ENTITLEMENT_GRANTED`) with the reason, `authorizationRef`, `pilot=true`, `pilotAuthorizedBy` and `pilotExpiresAt`; the entitlement's stored reason carries `[auth:<ref>]`. Revocation (unused grants only) keeps its own audit.
- After `MMRI_PILOT_GRANT_EXPIRES` no new grant can be created (`PILOT_EXPIRED`). Existing entitlements are not changed automatically.
- Nothing is granted by configuration: no customer receives access until an administrator performs a grant.

## Verification (isolated stack and disposable database, synthetic data)
`backend/scripts/qa-gate-grant-pilot.mjs` — 13/13 (2026-11-23). Re-run it after any change to billing, entitlements or admin account routes.
Fail-closed AI policy that goes with the pilot: `backend/scripts/qa-gate-ai-required.mjs` — 5/5.

## Not covered
Live customer access, a production administrator roster, and the expiry date itself are decisions for the owner; they are deliberately not part of the repository.
