# BusinessMRI on Windows Server (IIS reverse proxy)

Reference topology observed from the public site (`x-powered-by: ARR/3.0`, Let's Encrypt certificate, `/api/v1` answered by the Node API). The exact service wrapper, backend path and database location must be confirmed with `ops/windows/Diagnose-Production.ps1`; do not assume them.

```
Internet :443 -> IIS (TLS, static frontend = frontend/dist, URL Rewrite + ARR for /api/*)
                    -> Node API 127.0.0.1:4000 (backend, NODE_ENV=production)
                         -> PostgreSQL 127.0.0.1:5432 (database used by DATABASE_URL)
```

## Mandatory backend settings (production `.env`, never committed)
| Setting | Value | Why |
|---|---|---|
| `NODE_ENV`, `MMRI_ENVIRONMENT` | `production` | production guards |
| `ALLOWED_ORIGINS` | `https://businessmri.mn` (exact origin, no trailing slash) | CORS and CSRF origin check; `www` must redirect to the apex |
| `COOKIE_SECURE` | `true` | refresh cookie `__Secure-mmri_refresh` is HTTPS-only |
| `TRUST_PROXY` / `TRUST_PROXY_HOPS` | `true` / `1` (one proxy: IIS) | otherwise every visitor shares one client IP and the login/register/API rate limits (20 and 600 per minute) lock out all customers together. The API logs `proxy_trust_disabled` at start when this is wrong |
| `MMRI_BILLING_PROVIDER` | `qpay` (or `manual`) | `mock` is rejected in production |
| `DATABASE_URL` | database of the production installation | never a QA/demo database |

## IIS settings
1. Remove or disable `WebDAVModule` for the site (it answers `PUT`/`DELETE` with 405 before Node sees them; the 20-question save is a `PUT`). Verify: an unauthenticated `PUT /api/v1/companies/x/profile-answers` must return **401** from the API, not 405.
2. ARR: enable proxy; keep `preserveHostHeader` off unless the API is changed to expect it; allow `X-Forwarded-For` to be set by the proxy (URL Rewrite server variable `HTTP_X_FORWARDED_FOR`) so the API receives the real client IP.
3. Rewrite rule: `^api/(.*)` -> `http://127.0.0.1:4000/api/$1`; do not proxy `/health`, `/ready`, `/metrics` publicly.
4. Static files: serve `frontend/dist`; `index.html` with `Cache-Control: no-cache`, `/assets/*` immutable (hashed names). SPA fallback to `index.html` for non-file, non-`/api` paths.
5. Keep the security headers already present (CSP `default-src 'self'`, HSTS, `X-Frame-Options: DENY`).
6. Request limits: `maxAllowedContentLength` >= the API body limit (`REQUEST_BODY_LIMIT_BYTES`); ARR timeout >= 120 s (report/PDF generation).

## Deployment procedure (requires owner approval for every production step)
1. **Freeze and record**: `git rev-parse HEAD` of the release commit; build `cd frontend && npm ci && npm run build` and `cd backend && npm ci && npm run build:prod`; record SHA-256 of `frontend/dist/index.html` and the backend `dist` archive.
2. **Backup first**: `pg_dump -Fc` of the production database to a dated file **and** a restore test into a scratch database (`deploy/BACKUP_RESTORE.md`, `ops/backup-postgres.sh` logic); copy the current `frontend/dist` and backend folder to a dated rollback folder.
3. **Migrations**: only if `node ops/migration-chain.mjs --verify` passes and the owner approved each new migration. The ADMIN_GRANT migration `20261108100000` is **not approved** until the owner decides.
4. **Backend**: stop the service, replace the backend folder (keep `.env`), `npx prisma migrate deploy` only when approved, start the service, check `GET http://127.0.0.1:4000/health` (`releaseSha`) and `/ready`.
5. **Frontend**: replace `frontend/dist` atomically (new folder then switch the IIS physical path), purge nothing else.
6. **Smoke test** (authorized account only): `GET /` serves the new asset hash; `GET /api/v1/auth/me` -> 401; login with the authorized account; open company profile; save is not repeated on real customer data.
7. **Rollback**: switch IIS path back to the previous `dist`, restore the previous backend folder, restart; restore the database dump only if a migration ran and the owner approves.

## Hardening checklist (Windows Server 2022)
- Replace **Standard Evaluation** with a licensed edition (evaluation expires and then shuts down periodically); confirm with `slmgr /xpr`.
- Windows Update current; automatic restart outside business hours; services set to auto-start and restart on failure (Node API, PostgreSQL, IIS).
- Firewall: allow inbound 80/443 only; restrict RDP (3389) to a management IP or VPN; PostgreSQL `listen_addresses = '127.0.0.1'`; Node API bound to 127.0.0.1.
- Dedicated service account for the API (not Administrator); `.env` readable only by that account and Administrators.
- Time sync (NTP) and timezone documented (Asia/Ulaanbaatar); disk free space > 20 %; scheduled `pg_dump` with off-machine copy and a monthly restore test.
- Log retention and an uptime check on `https://businessmri.mn/api/v1/auth/me` (expects 401) so outages are noticed.
- Renew the Let's Encrypt certificate automatically (win-acme or equivalent); alert 14 days before expiry (current certificate expires 2027-02-07).
