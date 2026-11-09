# Backend completion — Step 17/20: production security hardening

Scope: server-side secrets, production configuration, payment/AI fail-closed defaults, proxy/rate-limit integrity, PDF subprocess isolation, durable report storage, and least-privilege PostgreSQL deployment.

## Hardened boundaries
- Production rejects MOCK billing and rejects `MMRI_BILLING_ENFORCEMENT=false`.
- Production runtime DB URL must be remote PostgreSQL over TLS and cannot use common administrator usernames.
- API runtime refuses to start if `MIGRATION_DATABASE_URL` is exposed to it.
- Production report storage must be an absolute durable path, not `/tmp` or `/var/tmp`.
- Docker production topology mounts persistent report storage while keeping the API root filesystem read-only.
- Production security secrets must be distinct, >=48 chars, and non-placeholder.
- Refresh cookie defaults to `__Secure-mmri_refresh` and requires the `__Secure-` prefix in production.
- Production CORS origins must be bare HTTPS, non-local origins.
- Trusted proxy IP extraction uses the configured trusted hop count from the right side of `X-Forwarded-For`; this prevents a client-prepended spoof value from becoming the auth/rate-limit key in the one-proxy topology.
- Until a shared limiter exists, production is explicitly limited to one API replica (`MMRI_API_REPLICA_COUNT=1`).
- PDF renderer receives a minimal subprocess environment and no longer inherits DB/OpenAI/QPay secrets.
- OpenAI production endpoint remains pinned to `https://api.openai.com/v1/responses`; placeholder AI config is rejected.
- Manual QR values have HTTPS/data-image type and size guards.
- Unknown production exceptions no longer echo raw infrastructure/provider/database details to customers.
- Production preflight scans frontend environment files for backend secret names/OpenAI-like keys.
- Connected DB verifier checks actual PostgreSQL role privilege and report-storage permissions later.

## Release gates
- `node backend/scripts/backend-step17-production-security-static.mjs`
- `node backend/scripts/backend-step17-production-security-regression.mjs`
- `node ops/preflight.mjs` with production environment populated
- Connected later: `NODE_ENV=production npm run db:verify:backend-production-security`

No frontend redesign, scoring methodology change, QPay credential, or real OpenAI key is included in this checkpoint.
