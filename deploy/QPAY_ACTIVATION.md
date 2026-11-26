# QPay Merchant V2 activation (from manual mode)

Every step that changes production needs the owner's approval. Stages A and B are separate: A ships the code and keeps manual payment.

## State on 2026-11-26
- Public catalog `GET https://businessmri.mn/api/v1/billing/plans` reports `provider=MANUAL`. The server decides this from `MMRI_BILLING_PROVIDER` in the API service `.env`.
- The production QPay credential file on the build computer passed sign-in, token refresh and `payment/check` (`backend/scripts/qpay-smoke.mjs`, no invoice). NOT verified: the invoice code, the server's own settings, a real invoice, callback, payment or bank-app scan.
- `GET /api/v1/billing/qpay/callback/<unknown id>` through IIS answers 404 "Billing invoice not found": the route reaches the API.
- Not inspected (no server access): server `.env`, database, migration level, service, backups.
- End-to-end tests use a LOCAL FAKE provider (`backend/scripts/qa-gate-qpay-e2e.mts`). They are not QPay verification.

## Step 1: inspect, back up, restore test (no deployment)
Run in an elevated PowerShell on the server. Neither script has been run or syntax-checked in PowerShell by us. The database steps of the second one were reproduced on Linux against a temporary database. Read both first.
1. `.\Diagnose-Production.ps1 -OutFile C:\Temp\mmri-diagnosis.txt` (read only: host, IIS/ARR sites and rewrite rules, processes, ports, existing backups).
2. `.\Step1-InspectBackupRestore.ps1 -BackendDir <running backend> -PgDatabase <db> -PgUser postgres -BackupRoot <new folder> -ReleaseDir <extracted package> -PgBin <PostgreSQL bin>`

Do NOT use `Backup-Postgres.ps1` for a pre-change backup: it deletes `mmri-*.dump` files older than 14 days in its folder and does not check the `pg_dump` exit code.
The restore is proven only if every summary line is PASS. Copy the backup folder to encrypted storage off the server.

## A. Deploy the release, still in manual mode
1-3. Run Step 1 again right before deployment; all lines PASS. Keep the current release folder untouched.
4. `npx prisma migrate status` (owner role, operator shell). Review every pending migration before `prisma migrate deploy`.
5. Deploy API and frontend from the same package (the countdown fix needs both). Follow `DEPLOYMENT_RUNBOOK.md`.
6. Check: `/api/v1/billing/plans` still says MANUAL, five payment pages show their colour, no countdown, QR black.

## B. Switch to QPay
### Settings (API service `.env` on the server)
| Setting | Value |
|---|---|
| `MMRI_BILLING_PROVIDER` | `qpay` (today `manual`) |
| `QPAY_BASE_URL` | `https://merchant.qpay.mn` (the code default is the SANDBOX; production refuses a sandbox address) |
| `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE` | production values; all three required |
| `MMRI_BILLING_CALLBACK_BASE_URL` | `https://businessmri.mn` (the code default is local and is refused in production) |
| `MMRI_BILLING_ENFORCEMENT` | `true` |
| `MMRI_DIAGNOSTIC_PRICE_MNT`, `MMRI_RETAKE_PRICE_MNT` | `300000` |
Run `node ops/preflight.mjs` with these settings. The server must reach `merchant.qpay.mn` over HTTPS; run `qpay-smoke.mjs` on the server too.

### Open manual invoices MUST be closed first
An open invoice is reused whatever provider created it, and manual invoices never expire. A customer with an open manual invoice would keep the static QR and get no automatic confirmation. After the switch the server also refuses manual confirmation.
1. List them (read only):
   `select id,"companyId","domainCode","planCode","amountMnt","createdAt" from billing_invoices where provider='MANUAL' and status in ('CREATED','PENDING') order by "createdAt";`
2. Stop new manual invoices for the switch window.
3. While still in MANUAL mode: match each row against the bank statement. Confirm the paid ones in the administrator panel. Cancel only those proven unpaid (the application's cancel action, never SQL).
4. The query must return no rows. Then change the settings and restart the service.

### Confirmation and access (existing behaviour, unchanged)
Callback `…/api/v1/billing/qpay/callback/<invoice>?token=…` (GET or POST) is only a signal: the API asks QPay `payment/check` and verifies invoice, MNT and amount before granting one right for that one domain. A 60-second server sweep recovers lost callbacks (first check about 2 minutes after creation). The open payment page polls every 5 seconds and moves to the diagnosis.

## C. Controlled test (real money, needs explicit approval)
1. A designated test company; one category; one real invoice. This is the first proof of the invoice code.
2. Before paying: QR present, 30-minute countdown, bank-app links on a phone, refresh keeps the same invoice.
3. Colour scan (optional, no payment): in that browser only, run `localStorage.setItem('mmri.qrColorPreview','on')` and reload. Scan the coloured code with each banking app you intend to support, on at least one Android and one iPhone, stopping before the payment confirmation. Compare payee and amount (300,000₮) with the black code. Each further category needs its own invoice; cancel unpaid ones afterwards.
4. Pay 300,000₮ once. Record: time of payment; time the page opens the diagnosis; invoice `PAID` with `callbackReceivedAt`; exactly one entitlement for that domain; the other four still ask for payment.
   If `callbackReceivedAt` stays empty and access arrives only after about 2 minutes, the sweep did it: the callback is not proven (check the IIS log for the callback request and its status; the log holds the token, so do not share it).
5. Refund: made in QPay or the bank by the owner, then recorded in the administrator panel.
6. Rollback: set `MMRI_BILLING_PROVIDER=manual` and restart. First close or reconcile open QPay invoices: a manual-mode server cannot verify or cancel them.

## D. Coloured QR for customers
Colour is off by default. After a category passed step C3 in every supported app, set `VITE_MMRI_COLOR_QR_AREAS=<categories>` in `frontend/.env.production`, rebuild and redeploy the frontend. Categories not listed stay black. Dense codes (over 77 modules) stay black. Customers can always switch a coloured code to black.
