# Business e-mail and AI provider: configuration and status

Secrets are never written here. Variable **names** only.

## E-mail
### What exists
`backend/src/api/mail/mailer.ts`: providers `mock` (QA only, forbidden in production), `disabled` (production default, sends nothing) and `resend` (fixed HTTPS endpoint, no redirects, bounded timeout, sanitised errors). "Delivered" means **accepted by the provider**, never confirmed inbox arrival.
Already live in the code: account verification and password recovery (single-use token, hashed at rest, TTL `PASSWORD_RESET_TTL_MINUTES`, constant response time, rate limits, same answer for unknown accounts), password-changed notice.
New in this release (all OFF by default): `backend/src/api/mail/lifecycle-mail.ts` — assessment-completed acknowledgement, report-under-review, report-released (customers) and new-review / review-overdue alerts (administrators). Exactly-once claims in `mail_dispatch_marks` (migration `20261116123000_mail_dispatch_marks`), retry with back-off (10 min × attempt, max 5), 30 s dispatcher timer + maintenance pass, 48 h window, plain-text templates (no HTML, single-line interpolation, links built from `MMRI_PUBLIC_APP_URL`).

### Variables
`MMRI_MAIL_PROVIDER` (`resend`), `RESEND_API_KEY`, `MMRI_MAIL_FROM` (plain address on the verified domain), `MMRI_MAIL_REQUEST_TIMEOUT_MS`, `MMRI_PUBLIC_APP_URL` (**https** public origin; `resend` requires it), `MMRI_CUSTOMER_EMAILS=on|off`, `MMRI_ADMIN_ALERT_EMAILS` (comma list), `MMRI_MAIL_RECIPIENT_ALLOWLIST` (comma list of addresses/@domains; **QA and the first real-provider test only** — every other recipient is dropped before the provider; leave empty in production).

### Status on 2026-11-16
- **Real delivery: BLOCKED.** No `MMRI_MAIL_PROVIDER` / `RESEND_API_KEY` / `MMRI_MAIL_FROM` exists in any environment file on this machine (they appear only in `.env.example`). The owner confirmed an account exists; the credentials and an authorised test inbox must be supplied to the process.
- Verified locally with the mock mailbox and a recording fake: verification and reset links, single use, TTL, enumeration-safe responses (existing suites), and the 20-check lifecycle regression `backend/scripts/qa-lifecycle-mail-regression.ts` (exactly once, 5-way race, back-off, exhaustion, template injection, per-recipient admin claims, allowlist, hashed admin recipients).

### First real-provider test (needs the owner)
1. Verify the sending domain at the provider; publish the records it shows. Typical records (**not applied by this work; exact values come from the provider's dashboard**): SPF `v=spf1 include:<provider-spf-host> ~all` on the sending domain (merge into the existing SPF record, never add a second one); the DKIM CNAME/TXT keys the provider issues; DMARC `_dmarc.businessmri.mn TXT "v=DMARC1; p=none; rua=mailto:<monitored-inbox>"`, tightened to `quarantine` after reports look clean.
2. On the server only: set the three provider variables, `MMRI_PUBLIC_APP_URL=https://businessmri.mn`, and `MMRI_MAIL_RECIPIENT_ALLOWLIST=<the authorised test address>`.
3. Run a verification and a reset against that address; check the received headers (SPF/DKIM/DMARC pass, correct From domain), the link host and expiry, a second request within the rate limit, and a deliberately wrong token.
4. Remove the allowlist, then enable `MMRI_CUSTOMER_EMAILS=on` (enabling it later sends mails for notifications created in the previous 48 h).

## AI report provider
### What exists
`backend/src/api/ai-report-provider.ts` + `backend/src/report/openai-narrative-provider.ts` (OpenAI Responses API; production pins `https://api.openai.com/v1/responses`). Strict JSON-schema output, `store:false`, bounded timeouts and retries (429 `credit_balance_exhausted` / quota codes are never retried), key redaction in errors, usage telemetry (`telemetry.usage`), validator V01-V39 with one repair round and a deterministic fallback; a payload whose hash does not verify is refused before any request. The AI writes wording only: scores, answers and findings come from the frozen payload.

### Variables
`MMRI_AI_REPORT_PROVIDER=openai|disabled`, `MMRI_AI_REPORT_MODEL`, `OPENAI_API_KEY`, `MMRI_AI_REPORT_ENDPOINT`, `MMRI_AI_REPORT_REQUIRED`, timeouts/retries `MMRI_AI_REPORT_TIMEOUT_MS`, `…_TOTAL_TIMEOUT_MS`, `…_MAX_RETRIES`, `…_MAX_OUTPUT_TOKENS`.

### Status on 2026-11-16
- A one-call smoke test with a synthetic payload reached the provider with the configured key and model: **HTTP 429 `credit_balance_exhausted`** (“You have no credits remaining”; request id recorded in `ENGINEERING_AUDITS/FINAL_COMPLETION_20261116/evidence/ai_real_provider_smoke.json`). The adapter handled it as designed (no retry, deterministic report, validation PASS). **Real-model output could not be produced, so its Mongolian quality, specificity and cost are NOT ASSESSED and the AI report must not be called verified.**
- The adapter, retry classification, secret hygiene and the BLOCK/REPAIR/fallback boundaries are verified against a loopback server speaking the Responses protocol (`backend/tests/ai-provider-protocol.test.ts`, 10 tests). That is protocol evidence only.
- Harness for the real run once credits exist: `backend/scripts/qa-ai-report-quality.ts` (synthetic payloads from QA runs only, hard call budget `MMRI_AI_QA_MAX_CALLS`, records tokens, latency, validation state, 3-page fit, repetition and numeric-grounding metrics). A native Mongolian business editor must still review the generated text.
