# Local development

This page is about running BusinessMRI.mn on one developer machine. Production deployment is in `DEPLOYMENT.md` and `deploy/`.

## What runs where

| Part | Address | Notes |
|---|---|---|
| PostgreSQL (Docker container `mmri-v3-local-postgres-1`) | `127.0.0.1:55432` | one container, several databases |
| API (`backend/`) | `http://127.0.0.1:4300` | `node --import tsx src/api/server.ts`, health: `/ready` |
| Web (`frontend/`, Vite) | `http://127.0.0.1:5291` | `VITE_DEV_API_TARGET=http://127.0.0.1:4300 npx vite --host 127.0.0.1 --port 5291` |

## The local database

`backend/scripts/local-dev-db.sh [mmri_dev_<name>]` creates ONE new, empty database in the container, applies the committed Prisma migrations and installs and activates the five approved methodology bundles.
It refuses to touch a database that already exists and never drops, truncates or copies anything. The database password is read from the container environment at run time.

Other databases in the same container (`mmri`, `mmri_qa_acc2_*`, ...) are disposable QA copies or older snapshots; the QA gates in `backend/scripts/qa-gate-*.mts` clone them. Do not point the application at a database holding real customer data.

## backend/.env (local, never committed)

Start from `backend/.env.example`. For local work set at least:

- `DATABASE_URL` to the clean database on port `55432` (not `5432`).
- `MMRI_AI_REPORT_PROVIDER=disabled` and `MMRI_AI_REPORT_REQUIRED=false` (`openai` + `required` without a key refuses to start).
- `MMRI_BILLING_PROVIDER=mock` and empty `QPAY_*`, `MMRI_MAIL_PROVIDER=mock`.
- `PORT=4300` and `ALLOWED_ORIGINS` containing the web origin.

`PASSWORD_PEPPER` must never change once accounts exist in a database: a different pepper makes every stored password unusable.

## Demonstration accounts (exactly three)

| Role | Sign-in | E-mail |
|---|---|---|
| Sadmin | `http://127.0.0.1:5291/#/admin` | `dev.admin@mmri.test` |
| Admin | `http://127.0.0.1:5291/#/admin` | `dev.reviewer@mmri.test` |
| User (example company "Алтан Говь Трейд ХХК") | `http://127.0.0.1:5291/#/login` | `dev.customer@mmri.test` |

Passwords and the authenticator secret live ONLY in `~/mmri-secrets/local-dev-credentials.env` (never in Git). On a new device every account also needs the six-digit e-mail code; the Sadmin additionally needs the authenticator code
(`python3 ~/mmri-secrets/local-admin-code.py`). Latest e-mail code of one account (the mock mailer writes it to `backend/.mock-mailbox/outbox.jsonl`):

    python3 backend/scripts/local-mail-code.py dev.customer@mmri.test

The example User demonstrates, per category: Marketing = two published reports + a retake in progress (access granted by the Sadmin); IT = published first report + retake awaiting review (countdown running);
Finance = published first report + retake awaiting review (overdue); People = two published reports + paid access ready, not started, plus created / pending / failed / cancelled payment attempts;
Operations = two published reports, no further access (payment required). The Admin has both lists (ХЯНАХ ТАЙЛАН with a positive and an overdue countdown, ДУУССАН ТАЙЛАН with 8 reports).

## Rebuilding or checking the demonstration data (local only)

    cd backend
    MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri_dev_clean npx tsx src/qa-cleanup.ts reset-demo --keep=<sadmin>,<admin>,<user>   # keeps three accounts + the user's company, removes everything else
    MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri_dev_clean MMRI_QA_EMAIL=<user e-mail> npm run qa:seed                        # deterministic completed diagnoses and payment states (company must still carry the QA name)
    python3 scripts/local-e2e/stage-demo.py                                                                                # company information, reviews, awaiting / overdue reports, retake in progress
    python3 scripts/local-e2e/verify-demo.py                                                                               # checks everything through the real APIs

The e2e scripts in `backend/scripts/local-e2e/` use disposable fixtures (their own company) and remove their own records afterwards (`src/qa-cleanup.ts`).
