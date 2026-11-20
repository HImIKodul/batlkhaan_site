# Customer notifications (server-side)

Replaces the browser-local read/dismissed state of the bell menu with state stored per account in PostgreSQL, so it is identical on every browser and device.

## Status
Implemented and tested on an isolated QA database. **Not applied to production.** Production keeps the previous behaviour until the migration is applied and `MMRI_CUSTOMER_NOTIFICATIONS=on` is set (see Activation).

## Data
Table `customer_notifications` (migration `20261116120000_customer_notifications`, additive; no existing table is touched).

| Column | Meaning |
|---|---|
| `userId` | recipient (FK `users`, cascade) |
| `companyId` | tenant, null for account events (FK `companies`, cascade) |
| `type` | `PAYMENT_CONFIRMED`, `ASSESSMENT_COMPLETED`, `REPORT_UNDER_REVIEW`, `REPORT_APPROVED`, `REPORT_RELEASED`, `ACCOUNT_EMAIL_VERIFIED`, `ACCOUNT_PASSWORD_CHANGED` (CHECK) |
| `title`, `message` | Mongolian text shown to the customer (length CHECKs) |
| `destination` | route name from a fixed list: `home analysis results report billing profile settings` (CHECK) |
| `payload` | ids the client needs (`assessmentId`, `domainCode`, `invoiceId`) |
| `eventRef`, `dedupeKey` | source of the event; `(userId, dedupeKey)` is UNIQUE, so event generation is idempotent |
| `createdAt`, `readAt`, `dismissedAt` | list order is `createdAt desc, id desc` only; reading never reorders |

## Events (each tied to a real state transition)
| Type | Emitted when | Recipients | Idempotency key |
|---|---|---|---|
| `PAYMENT_CONFIRMED` | after commit of the transaction that really moved an invoice to PAID (`billing-service.activatePaidInvoice`; manual-confirm and mock-pay go through the same path) | OWNER, ADMIN | `PAYMENT_CONFIRMED:<invoiceId>` |
| `ASSESSMENT_COMPLETED` | inside the transaction that finishes an assessment (all three terminal paths) | all members | `…:<assessmentId>` |
| `REPORT_UNDER_REVIEW` | same transaction, when a review row exists | all members | `…:<assessmentId>` |
| `REPORT_RELEASED` | `ReviewService.publish` success; or at completion when the review workflow is off | OWNER, ADMIN, CONSULTANT, VIEWER | `…:<assessmentId>` |
| `REPORT_APPROVED` | `ReviewService.approve` success | same as above | `…:<reviewId>` |
| `ACCOUNT_EMAIL_VERIFIED`, `ACCOUNT_PASSWORD_CHANGED` | verification / reset confirmation | that user | `…:<userId>` / `…:<token row id>` |

A payment notification is never created without a verified PAID transition.

## API (`/api/v1`, authenticated; every call is scoped to the caller)
| Call | Result |
|---|---|
| `GET /notifications?companyId=&limit=1..50&cursor=&unread=true` | `{items, unreadCount, nextCursor}`; `companyId` needs membership (403 otherwise) |
| `GET /notifications/unread-count?companyId=` | `{unreadCount}` |
| `POST /notifications/:id/read` / `/unread` / `/dismiss` | updated notification + `unreadCount`; dismiss is idempotent |
| `POST /notifications/read-all?companyId=` | `{updated, unreadCount}` |
Another user's id, an id from a company the caller left, or a malformed id → 404. When the feature is off the API answers `404 NOTIFICATIONS_DISABLED` and the client falls back to its previous local behaviour. Mutations are rate-limited (120 / minute / user).

## Privacy
Account erasure deletes the user's rows; company erasure deletes the company's rows. Company rows are visible only while the recipient is still a member.

## Activation (production) — needs owner approval
1. Back up (`ops/backup-postgres.sh`) and note the migration fingerprint (`ops/migration-chain.mjs`).
2. `prisma migrate deploy` (applies `20261116120000_customer_notifications` and `20261116123000_mail_dispatch_marks`); update `deploy/MIGRATION_CHAIN_SHA256.txt` and `backend/prisma/MIGRATION_CHAIN_SHA256.txt` in the release.
3. Deploy the new code, set `MMRI_CUSTOMER_NOTIFICATIONS=on`, restart. Check `/api/v1/notifications/unread-count` with a test account.
Without step 2 the flag is ignored (the table probe fails, an error is logged, nothing is written).

## Rollback
Set `MMRI_CUSTOMER_NOTIFICATIONS=off` (instant; the bell returns to the local behaviour). Data can stay. To remove: `DROP TABLE customer_notifications;`.

## Known limits
Notifications are created from the moment the feature is on; there is no back-fill of past events. Customers with several companies see account events plus the active company's events.

## Tests
`backend/scripts/qa-customer-notifications-regression.mjs` (24 checks, two companies, a viewer, review workflow, idempotency, persistence across logins, pagination, tenant removal, erasure) and the browser run in `ENGINEERING_AUDITS/FINAL_COMPLETION_20261116/`.
