# MMRI API security model — v1.2.0

Authentication uses a short-lived HS256 access token (default 15 minutes) plus a rotating opaque refresh token in an HttpOnly, SameSite=Strict cookie. Passwords use scrypt with a server-side pepper. Refresh-token material is never stored directly; PostgreSQL stores SHA-256 token hashes. Reuse of a rotated token revokes its session family and increments the user's token version, invalidating access tokens.

Company authorization is membership-based. Roles are OWNER, ADMIN, ASSESSOR, CONSULTANT and VIEWER. Assessment writes require OWNER/ADMIN/ASSESSOR/CONSULTANT. Result reads permit all company roles. Membership management requires OWNER/ADMIN, and only OWNER may grant OWNER.

The API does not expose question-to-cell mappings, option scores, evidence reliability, confidence rules, routing priorities, or secondary targets in respondent question payloads. Result APIs distinguish `partialScore` from `officialScore`; QUICK results cannot masquerade as official FULL results.

Production deployment must terminate TLS, set `COOKIE_SECURE=true`, use independent high-entropy secrets, trust `X-Forwarded-For` only from the controlled reverse proxy, and replace the in-process auth rate limiter with a distributed Redis-backed limiter if more than one API instance is deployed.

## Strategy/report security additions (v1.3.0)

- Diagnosis, recommendation, action-plan and report routes are terminal-assessment only.
- Strategy artifacts freeze against a deterministic terminal snapshot hash.
- Report payloads freeze against SHA-256 and are version-pinned.
- AI/report rendering is closed-book by default and cannot alter diagnosis.
- Every factual narrative claim must have a valid source trace.
- Unknown recommendation/root/milestone IDs block report publication.
- QUICK estimates cannot be labeled as official FULL scores.
- N/A and DNK cannot be rendered as numeric zero.
- Unsupported future financial claims and external facts are blocked.

## Payment security additions (v2.5.0)

- The browser never receives QPay merchant credentials and never calls QPay Merchant V2 directly.
- Commercial amounts are server-authoritative. `MMRI_DIAGNOSTIC_PRICE_MNT` is backend configuration, not trusted browser input. The current customer product has no monthly or annual subscription.
- Each local billing invoice gets a random callback token; only its SHA-256 hash is stored. Callback token comparison is timing-safe.
- A callback is a trigger, not proof of payment. After a QPay callback, the server calls `POST /v2/payment/check` for the provider invoice and activates access only when the provider-confirmed paid amount covers the local invoice amount.
- QPay access tokens are cached until near expiry rather than requested for every API call.
- Callback handling is idempotent. One paid invoice can create at most one entitlement because `sourceInvoiceId` is unique.
- Each paid diagnostic entitlement is one-assessment use. There is no current monthly or annual membership product.
- When billing enforcement is enabled, assessment creation fails with `402 PAYMENT_REQUIRED` unless a usable entitlement exists.
- A diagnostic entitlement is claimed before assessment creation and released if assessment persistence fails.
- The local `mock-pay` endpoint is unavailable in production and cannot be used for a QPay invoice.
- Provider payload persistence is minimized to reconciliation fields. Provider tokens, credentials and full arbitrary responses are not stored.
- Production defaults to QPay and billing enforcement. Startup fails if QPay credentials or enforced production prices are absent.
- QPay callback base URL must be a publicly reachable HTTPS API origin in sandbox/production. `localhost` is suitable only for local MOCK mode.

## Production security hardening (v1.7.0 / Step 21)

Step 21 adds fail-closed production configuration and request/session hardening without changing MMRI methodology or scoring.

- Production requires `Secure` refresh cookies and HTTPS-only browser origins.
- Access-token, password-pepper and audit-hash secrets must be distinct; token lifetimes are bounded.
- QPay API/callback endpoints must use non-local HTTPS URLs in production.
- API request bodies and server request/header/keep-alive lifetimes are bounded.
- General API, auth-IP, auth-account and refresh/logout throttles are separate. In-memory buckets are pruned and bounded; horizontally scaled production deployments must replace this with a shared limiter.
- Login performs a dummy scrypt verification for unknown accounts to reduce timing-based account discovery.
- JWT header (`HS256`/`JWT`), claim shape, issue time and maximum lifetime are validated explicitly.
- Refresh/logout browser requests enforce the configured origin allow-list in addition to `SameSite=Strict` cookies.
- Request IDs are accepted only when bounded and syntactically safe; otherwise the server creates a UUID.
- Security headers include HSTS in production, Permissions-Policy, COOP/CORP, CSP, no-sniff and no-store.
- A company cannot be left without an `OWNER` through role changes.
- Malformed cookie percent-encoding is ignored rather than causing a server error.
- Graceful shutdown has a bounded hard-stop and disconnects Prisma.

The live database-backed security/RBAC behavior must be re-exercised by the Step-20 PostgreSQL/browser integration gate in a connected environment before production release.

## Step 13/15 security re-audit — RBAC/session corrections (2026-09-12)

The 15-step audit re-runs the production security model against the current v3.0.0 methodology / v3.1.0 question-bank application. Step 13 adds the following controls without changing diagnostic mathematics:

- Diagnostic-input authority is now `OWNER | ADMIN | ASSESSOR`. `CONSULTANT` cannot start, answer, pause/resume, draft, heartbeat or complete an assessment.
- Review/execution authority is now `OWNER | ADMIN | CONSULTANT` for strategy generation, plan-status changes and report-payload freezing. `ASSESSOR` cannot mutate review outputs.
- `VIEWER` remains read-only. A viewer may read an already-published report, but cannot cause payload freezing, narrative generation or report publication.
- Pilot enrollment requires the same actor to be the pilot-study coordinator and an `OWNER/ADMIN` of the company being enrolled. Pilot feedback excludes `VIEWER`.
- Membership role changes are written to `AuthAuditEvent` with actor, target user, company, previous role and next role; the final-owner guard remains fail-closed.
- Refresh rotation now uses an atomic `revokedAt IS NULL` compare-and-set. A concurrent second rotation is treated as replay: the refresh family is revoked and `tokenVersion` is incremented.
- In production, cookie-authenticated refresh/logout requires an explicit allowed `Origin`; `SameSite=Strict`, `HttpOnly` and `Secure` remain in force.
- Browser access tokens are memory-only. The frontend removes the legacy persisted `mmri.accessToken` key and re-establishes a session after reload via the HttpOnly refresh cookie.
- Company/assessment identifiers may remain in local storage as non-secret UI context, but failed session restoration clears that context before another user session is established.

The in-process rate limiter remains suitable only for a single API instance. Horizontally scaled production must use a shared gateway/Redis limiter with equivalent keys and bounds. Live cross-tenant/session checks remain a connected PostgreSQL/API gate.

## Backend completion Step 03/20 — tenant/ownership hardening (2026-10-24)

- Assessment, billing-invoice and pilot-enrollment identifiers are resolved through tenant-scoped membership predicates before protected objects are read. Foreign identifiers therefore use the same `NOT_FOUND` surface as nonexistent identifiers.
- Company membership mutation re-checks the actor inside the same transaction that changes the target role and writes the audit event. Disabled target users cannot receive new membership.
- PostgreSQL enforces final-owner continuity with `company_memberships_last_owner_guard`. The trigger serializes OWNER-removal checks per company with a transaction advisory lock, preventing concurrent owner demotions/deletions from leaving a company ownerless.
- Internal pilot-study management and methodology-calibration management are not customer capabilities. They are additionally gated by `MMRI_OPERATOR_USER_IDS` (immutable account ids; `MMRI_OPERATOR_EMAILS` is honoured only outside production because registration does not verify e-mail ownership); an empty allowlist fails closed for those management endpoints.
- Pilot/calibration creator/participant lookups do not reveal whether a foreign identifier exists.
