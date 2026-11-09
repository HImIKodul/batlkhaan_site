# Backend completion — Step 03/20

Scope: authentication, company ownership, tenant isolation, permission integrity.

Changes:
- Assessment authorization now resolves through a tenant-scoped query; foreign assessment IDs return the same not-found surface as nonexistent IDs.
- Billing invoice and pilot-enrollment access now use tenant-scoped access helpers before reading the protected object.
- Pilot-study management and all methodology-calibration routes require `MMRI_OPERATOR_USER_IDS` in production (`MMRI_OPERATOR_EMAILS` only outside production); an empty allowlist disables those internal governance surfaces for customer accounts.
- Foreign pilot-study/calibration identifiers are hidden behind scoped `findFirst` lookups.
- Company membership changes are atomic: actor authorization, target-user status, last-owner policy, role update, and audit event occur in one transaction.
- Disabled users cannot be newly granted company membership.
- PostgreSQL now has a serialized last-OWNER trigger using a transaction-scoped advisory lock, closing concurrent demotion/deletion write-skew.
- Connected verifier checks owner continuity, active-owner availability, membership/refresh referential integrity, and reports historical assessment creators that are no longer members without failing on that legitimate history.

Production configuration:
- Set `MMRI_OPERATOR_EMAILS` only for trusted internal MMRI governance accounts. Ordinary customer accounts must not appear in this list.
- Leave it empty if pilot/calibration management is not needed in the production customer API.

No frontend redesign was performed.
