# Data lifecycle: recovery, export, erasure, retention (as implemented 2026-11-05)

This is a technical description of what the code does. It is **not** a legal opinion. Items marked **DECISION** need the owner's or a lawyer's approval; the code does not invent them.

## 1. Where personal and customer data lives
| Data | Tables | Notes |
|---|---|---|
| Account | `users`, `refresh_sessions`, `password_reset_tokens`, `auth_audit_events` | password is an scrypt hash with a server pepper; IP and user agent appear only as salted hashes |
| Company | `companies`, `company_memberships` | profile columns and `profile` JSON |
| Diagnosis content | `assessments`, `answers`, `answer_events`, `response_drafts`, results tables, `diagnosis_snapshots`, `strategy_plan_snapshots`, `recommendations`, `action_plans`, `report_snapshots`, `report_artifacts` (+ PDF files in report storage), `trace_snapshots` | all cascade from `assessments` |
| Payments | `billing_invoices`, `company_entitlements` | invoices cascade from `companies` and restrict deleting their creator |
| AI | none stored by the app; the provider call uses `store:false` | the narrative itself is stored in `report_snapshots.narrative` |

## 2. Password recovery
`POST /api/v1/auth/password-reset/request` (always `202`, same body and a minimum response time whether or not the address exists) and `POST /api/v1/auth/password-reset/confirm`.
Token: 256 random bits, only a salted SHA-256 is stored, 30 minutes (`MMRI_PASSWORD_RESET_TTL_MINUTES`), single use, a newer request voids older tokens, at most 3 per account per hour, per-IP and per-address rate limits. Confirming sets the password, increments `tokenVersion` (all access tokens die), revokes every refresh session, voids other tokens, writes audit events and queues a "password changed" notice.
**E-mail delivery:** only a `mock` mailer (writes `backend/.mock-mailbox/outbox.jsonl`, forbidden in production) and a `disabled` mailer exist. **No real mail provider is implemented or tested.** In production the preflight warns that recovery e-mail is not delivered. DECISION: choose and integrate a provider (SMTP or transactional service), sender domain with SPF/DKIM/DMARC.

## 3. Export
`GET /api/v1/account/export` (the signed-in user) and `GET /api/v1/companies/:id/export` (OWNER only). JSON attachment, `Cache-Control: no-store`, explicit field lists: no password or token hashes, no IP hashes, no QR payloads or provider metadata. Company export holds the company profile, members, assessments with saved answers, the latest diagnosis result, plan and report payload and narrative, payments (amount, status, dates) and entitlements. Each export is audit-logged (counts only).

**Unpublished reports (2026-11-06):** the company export applies the same publication rule as the report endpoints. For an assessment whose report review is not PUBLISHED (or that finished without a review while the workflow is on) the scores, diagnosis, plan and report text are withheld (`derivedContent: "WITHHELD_PENDING_REVIEW"`); the owner's submitted answers and company data are always exported.

## 4. Erasure
Both endpoints need the password and an exact typed confirmation and are rate limited.
- `POST /api/v1/companies/:id/erase` (OWNER). One transaction: marks the company erased, deletes every assessment (answers, results, snapshots, reports, plans cascade), deletes memberships, anonymises the company row (name becomes "Устгасан байгууллага", profile columns emptied). After commit the report PDF files are deleted from storage. Blocked (409) if the company is linked to a pilot study. The database last-owner guard now lets an **erased** company drop its final owner (migration `20261105121000`).
- `POST /api/v1/account/erase`. Blocked (409 `SOLE_OWNER`, names the companies) while the user is the only OWNER of a live company. Otherwise one transaction: removes memberships, refresh sessions and reset tokens, anonymises the user (`erased+<id>@erased.invalid`, no name, random unusable password, status DISABLED, `erasedAt`), bumps `tokenVersion`. The e-mail can be registered again.
- **Retained on purpose:** `billing_invoices`, `company_entitlements` (they would otherwise be cascade-deleted with the company) and `auth_audit_events`. These rows hold amounts, statuses, dates and hashed technical identifiers; the erased company/user rows stay as anonymised shells so the foreign keys remain valid.
- **Report review records (added 2026-11-06).** `report_reviews` references `assessments` with `ON DELETE RESTRICT` and `report_review_revisions` is append-only, so company erasure used to fail for any assessment that had a review. Now, inside the same erasure transaction: (1) one content-free `REVIEW_ERASED_WITH_COMPANY` event per review is appended to the append-only `admin_audit_events` (ids, domain, status at erasure, revision count, timestamps; no narrative, no company name); (2) the review's suggestions and revisions (customer narrative text) are deleted - the revision trigger permits DELETE only while the transaction-local setting `mmri.erasure` is on, UPDATE and any DELETE outside an erasure stay refused; (3) the company name in admin notifications for those reviews is redacted; (4) the review rows are deleted so the assessments can be. `admin_audit_events` is never deleted or altered. Migration `20261106120000_review_hardening`.
- **Policy-dependent, NOT decided by the code:** how long the content-free review audit events and the payment-dispute / support-case rows (which keep `companyId` and free text) must be kept, and whether the free text in disputes and support cases must be redacted on erasure. See decisions 8 and 9.
- Not covered: database backups and `pg_dump` files keep erased data until they expire; the AI provider is called with `store:false` so no provider-side copy is intended, but the provider's own terms are not verified here.
- Historical assessments of OTHER companies are never touched; the regression test counts pre-existing assessments before and after.

## 5. DECISIONS for the owner (nothing below is invented by the code)
1. Retention period for payment and entitlement records (financial/tax law) and whether to hard-purge the anonymised shells afterwards.
2. Retention period for `auth_audit_events` and for diagnosis data of accounts that simply stop using the service.
3. Backup retention and how erasures are propagated to backups.
4. Whether erasure needs a cooling-off period, a written request, or operator review (today it is immediate and irreversible after password confirmation).
5. Whether erased reports may be kept in anonymised or aggregated form for methodology calibration (today they are deleted).
6. Mail provider and sender domain for recovery e-mail; support contact for rights requests.
8. Retention period for administrator audit evidence (`admin_audit_events`) that refers to an erased company's reports.
9. Whether `payment_disputes`, `support_cases` and their event text must be anonymised when the company is erased (they are retained untouched today; they restrict deletion of the company row, which is anonymised, not deleted).
7. Approval of the Privacy Policy and Terms drafts (`frontend/src/content/legal.ts`), including the data controller's identity.

## 6. Tests
`backend/scripts/qa-password-recovery-regression.mjs` (17 checks), `qa-data-lifecycle-regression.mjs` (22 checks), `qa/ui-recovery-legal-data.mjs` (37 browser checks). They need the dev API, the local Postgres container and create only their own throw-away accounts.
