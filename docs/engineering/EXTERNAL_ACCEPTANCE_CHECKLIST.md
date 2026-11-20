# BusinessMRI.mn external configuration and evidence checklist

No external email, bank payment, DNS change, public callback exposure or deployment was performed. Local mock adapter/transaction tests are not provider verification. Use separate authorized test credentials and only recipient accounts/payment fixtures controlled by the owner. Record sanitized evidence privately; never include API keys, bearer tokens, raw ownership/reset links or callback secrets in public reports.

## Resend — owner: domain/mail administrator

| Setting | Required value/evidence |
|---|---|
| `MMRI_MAIL_PROVIDER` | `resend` only in the separately authorized provider test environment |
| `RESEND_API_KEY` | Server-only, least required sending scope; never in frontend, Git or logs |
| `MMRI_MAIL_FROM` | A plain mailbox on the verified sending domain, without display-name/header syntax |
| `MMRI_PUBLIC_APP_URL` | The authorized HTTPS application origin; correct `#/verify-email` and `#/reset-password` links |
| `MMRI_MAIL_REQUEST_TIMEOUT_MS` | Configured 1,000–15,000 ms; default 5,000 ms; record actual value |
| `MMRI_PASSWORD_RESET_TTL_MINUTES` | Configured 5–120 minutes; default 30; test both token purposes |

Add and verify a domain/subdomain owned by the organization in Resend. Publish the exact DNS records returned by that account, verify SPF/DKIM, and establish the chosen DMARC policy/alignment with the mail administrator. Do not copy fabricated record values. Disable link/open tracking for these security messages. Resend's [domain guidance](https://resend.com/docs/dashboard/domains/introduction) describes verification and transactional subdomains.

Acceptance evidence:

1. Record domain verification state, DNS query results and redacted received headers showing the sender and authentication alignment. Use three owner-controlled mailbox providers, including those used by intended Mongolian recipients; record inbox/spam placement and arrival times.
2. Register a new test address: generic pending response, no session before confirmation, correct branded mail, owner-established password, successful login, original registration password invalid if changed at confirmation.
3. Confirm once, then replay. Test expiry, replacement after cooldown, 60-second resend cooldown and three-per-hour purpose-specific cap. Do not bypass caps to create delivery volume.
4. Recover the password; confirm old customer access/refresh and admin sessions are revoked. Test invalid/expired/reused links without changing credentials. Keep the new secret out of evidence.
5. Compare unknown/known-address request bodies/status and timing under normal delivery, slow delivery, provider rejection and timeout. A timeout/acceptance ambiguity is not proof of inbox failure or success. Capture provider message IDs and acceptance/rejection timestamps, not raw link tokens.
6. Observe a controlled invalid/suppressed-recipient test using Resend-approved methods. Save provider dashboard delivery/bounce/complaint status and the app's sanitized request/delivery-failure audit evidence. Define who monitors and responds to these events.

**Scope distinction:** the application has no verified delivery/bounce webhook ingestion or durable mail queue in this acceptance scope. Provider-console evidence can establish external delivery/bounce behavior, but it cannot prove automatic application processing. If automatic ingestion is required, that is additional engineering, not merely a missing credential. A future receiver must authenticate the original raw body/signature before processing, deduplicate event IDs and reject stale/replayed requests; Resend's [webhook verification guidance](https://resend.com/docs/webhooks/verify-webhooks-requests) explains its signing headers. Do not mark that optional capability implemented.

## QPay sandbox — owner: merchant/payment administrator

| Setting | Required value/evidence |
|---|---|
| `MMRI_BILLING_PROVIDER` | `qpay` in a separately authorized sandbox test environment |
| `QPAY_BASE_URL` | `https://merchant-sandbox.qpay.mn`; never silently fall back to production |
| `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET` | Owner-issued sandbox merchant credentials, server-only |
| `QPAY_INVOICE_CODE` | The invoice code for the same authorized sandbox merchant |
| `QPAY_REQUEST_TIMEOUT_MS` | Recorded bounded timeout; default 10,000 ms |
| `MMRI_BILLING_CALLBACK_BASE_URL` | The authorized HTTPS test API base; no automatic public tunnel or production endpoint |
| Prices/enforcement | Explicit intended diagnostic/retake prices and enforcement; match invoice currency MNT |

The official [Merchant V2 reference](https://developer.qpay.mn/mn/docs/merchant?version=2.0.0) separates sandbox/production and requires authenticated payment checking after callbacks. A callback body or aggregate total is not payment proof.

Acceptance evidence:

1. Obtain explicit merchant authorization and sandbox payment instructions. Record merchant/environment identity without secrets. Verify token authentication and invoice creation, provider invoice ID, QR/deeplink behavior and the actual callback's reachability to the isolated test API.
2. Use the provider-approved sandbox payment method. Capture confirmed constituent transaction IDs/amounts/currency, invoice binding and sanitized `payment/check` response evidence. Match totals to actual confirmed transactions, including paginated/partial-payment behavior.
3. Deliver a valid callback, duplicate it, deliver concurrent callbacks/reconciles and retry after a simulated timeout. Check one invoice transition, one ledger claim per constituent and exactly one entitlement. Missing/wrong callback secret must not trigger verification/grant.
4. Exercise overlapping transaction sets if the sandbox supports producing them; otherwise distinguish the real PostgreSQL synthetic-contention proof from unsupported provider scenarios. Never relabel a fabricated provider response as live sandbox evidence.
5. Test partial/unpaid, delayed payment after cancellation, cancel/payment overlap, provider outage, missing/inconsistent response and reconciliation. Preserve late-paid entitlement behavior; do not overwrite confirmed payments with local cancellation.
6. Test an authorized sandbox refund and repeated refund/reconcile. Preserve transaction ownership and previous reports; consumed/revoked entitlements must not revive, and a retake creates separate assessment/report history.
7. Census any historical `qpay-set-*` rows **read-only** under the database owner's authorization. Migration backfills single references; combined hashes require genuine provider records. Resolve on an authorized environment through protected reconciliation. If refund/check responses no longer expose original paid rows, retain the blocker for operator investigation. Never invent ledger IDs or clear references to force acceptance.

Required sign-off artifacts: redacted provider account/environment identity, request/response/callback timeline, local invoice/ledger/entitlement snapshots, audit correlation IDs, refund evidence and an explicit PASS/FAIL/BLOCKED for unsupported cases. No real main-development or production payment history may be altered by the local acceptance runner.
