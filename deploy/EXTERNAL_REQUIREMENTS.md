# BusinessMMRI.mn — external requirements before production

Everything below depends on a third party, a credential, or the physical server, so it cannot be completed or verified by the repository alone.
Each item states what exists in the code, what is missing, what you must obtain, and the **acceptance test** that proves it. Until an item is accepted, the
production preflight (`ops/preflight.mjs`) and this list are the stop conditions. Never run these tests against production data; use the isolated
clone stack (`harness/`) or a staging copy, and never initiate real payments without explicit approval.

## 1. QPay merchant integration (payments)

- **In the code:** `backend/src/billing/qpay-client.ts` (OAuth token, `createInvoice`, `cancelInvoice`, `checkInvoicePayment` with amount check), public callback routes
  `GET|POST /api/v1/billing/qpay/callback/:invoiceId`, entitlements/retake logic, refund recording, price settings (300,000₮ diagnosis, 300,000₮ retake; retake keeps the old report).
- **Never exercised against the real service:** only the mock provider has ever run.
- **You must obtain from QPay (via your bank/merchant onboarding):** `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`, the production base URL (`QPAY_BASE_URL`, must not contain "sandbox" in production) **and a sandbox/test account first**; the list of callback source addresses if QPay publishes one; the merchant's settlement/refund procedure.
- **Needs from the server:** a public HTTPS callback origin (`MMRI_BILLING_CALLBACK_BASE_URL`), i.e. static IP + open 443 + valid certificate (see `DEDICATED_SERVER_SETUP.md`).
- **Acceptance test (sandbox, then one controlled live payment approved by the owner):**
  1. create an invoice → a QR/short URL is returned and stored;
  2. pay it → the callback arrives **and** the server independently re-checks with `checkInvoicePayment` (the callback body alone must never unlock a diagnosis);
  3. the entitlement becomes ACTIVE exactly once; replaying the callback is idempotent;
  4. wrong amount, expired invoice, cancelled invoice, double payment, and callback for an unknown/foreign invoice are all rejected without unlocking anything;
  5. a retake charges 300,000₮ and the previous report/hash remains retrievable;
  6. a recorded refund moves the invoice to REFUNDED with a unique reference (a partial unique index already enforces uniqueness).
- Until accepted: `MMRI_BILLING_PROVIDER=manual` (operator-confirmed payments, requires `MMRI_OPERATOR_USER_IDS` and a QR/URL) or payments off; **never `mock` in production** (the preflight refuses it).

## 2. Transactional e-mail provider

- **In the code:** a `Mailer` interface with only `mock` and `disabled` implementations (`backend/src/api/mail/mailer.ts`); enumeration-safe password-reset endpoints with rate limiting, single-use salted-hash tokens and full session revocation; the preflight **requires `MMRI_MAIL_PROVIDER=disabled`** in production because no real provider is implemented.
- **Missing (engineering):** a real `Mailer` implementation (SMTP or the provider's API) plus the e-mail-ownership verification flow (audit item MMRI-01 remainder: new accounts are not verified, so e-mail addresses are unproven), and relaxing the preflight rule once it is tested.
- **You must obtain:** a transactional provider account that can reach Mongolian recipients (provider choice is yours; judge by deliverability to the mailbox providers your customers actually use), a sending domain/sub-domain with **SPF, DKIM and DMARC** published, a from-address (e.g. no-reply@yourdomain), bounce/complaint handling, credentials in `deploy/.env.production` (never in the repo).
- **Acceptance test:** register → verification mail arrives (inbox, not spam) in at least three recipient mailbox providers; link works once and expires; password reset mail arrives, link works once, old sessions are revoked, an unknown address gets the same response as a known one; DMARC alignment passes in the received headers; bounces are logged.
- Until accepted: users cannot self-recover passwords; document a manual operator procedure.

## 3. OpenAI API (report narrative) — real-provider testing

- **In the code:** `backend/src/report/openai-narrative-provider.ts` (Responses API, structured output, token/timeout limits, retries), a strict validator (V01–V39, executive conclusion 80–160 words, numeric grounding), and a **deterministic fallback renderer**; the AI can never change scores or priorities.
- **Never exercised for real:** all tests used mock/disabled providers. A key exists in the git-ignored `backend/.env` of the development machine; it appears in several local backups (see the security notes) — **create a new production key** and revoke the old one when convenient.
- **You must obtain:** a dedicated production API key with a **monthly spend cap**, billing enabled, and confirmation that the account/region is accepted from the server's network; set `MMRI_AI_REPORT_PROVIDER`, model, endpoint, timeout and `MMRI_AI_REPORT_MAX_OUTPUT_TOKENS`.
- **Acceptance test (on a clone, with synthetic companies, all five domains):** each report generates within the timeout; validator state PASS; no invented numbers (grounding check), conclusion 80–160 words, Mongolian text quality reviewed by a native reviewer; injected company names with prompt-injection text are neutralised; forced provider failure (bad key, timeout, 429) falls back to the deterministic narrative without breaking the report or the PDF (still exactly 3 A4 pages); cost per report measured and multiplied by expected volume against the cap.

## 4. Backups and recovery (operations)

- **In the code:** `ops/backup-all.sh`, `verify-backup-set.sh`, `restore-backup-set.sh`, `restore-postgres.sh`, `restore-report-storage.sh`, with checksums and the migration-chain hash in the manifest.
- **You must provide:** an off-machine, encrypted destination (second site or object storage), an encryption key kept apart from the backups, a retention policy, and a named person responsible.
- **Acceptance test:** a full restore of the newest set into an **empty isolated database** on a different machine, then `db:verify:diagnosis` on samples from each domain and a PDF regeneration from a restored report; measured recovery time written down; repeated monthly. Alert when the newest set is older than 26 h.

## 5. HTTPS and the network

- **You must provide:** domain, DNS, static public IP, inbound 80/443, ISP confirmation that the ports are not filtered, a TLS certificate path (ACME HTTP-01, or DNS-01 if port 80 is blocked).
- **Acceptance test:** an external SSL test grades A or better; HSTS present; HTTP redirects to HTTPS; `curl -I` through the proxy shows the application's CSP/frame/referrer headers; cookies carry `Secure`/`HttpOnly`/`SameSite`; the API records the **real client IP** in audit logs (this validates `TRUST_PROXY_HOPS=2`); the plain-HTTP web port 8080 and the API port 4000 are unreachable from outside.

## 6. Production monitoring and alerting

- **You must provide:** an external uptime probe, a place alerts go (e-mail/Telegram/SMS) that is monitored out of hours, and an on-call owner.
- **Acceptance test:** deliberately stop the API, fill a test volume to 85 %, age a backup, and expire a staging certificate: each raises an alert within the agreed time; `/metrics` scrapes with the token; dashboards show request rate, 5xx, latency, DB connections, disk, memory, backup age, certificate expiry, UPS status.

## 7. Physical server acceptance (see `DEDICATED_SERVER_SETUP.md`)

UPS shutdown test, unattended power-loss recovery, disk-failure drill (if mirrored), SSH hardening review, `ufw status` review, and a load test (≈ 50 concurrent questionnaires with PDF generation) with memory/latency recorded.

## 8. Owner decisions that are still open (not credentials)

Hash-rounding confirmation is **resolved** (15 significant digits for new freezes). Still open: methodology content findings MMRI-14/15/32–42 (versioned release), the 3.0.4 methodology release governance, retention of the preserved `mmri_codexfix` dump, the Prisma 7 / vitest 5 upgrade timing, and the written approval for the live cutover.
