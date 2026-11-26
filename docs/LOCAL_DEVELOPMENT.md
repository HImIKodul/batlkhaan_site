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

## Synthetic accounts

Create a customer through the normal sign-up (mock mailbox: `backend/.mock-mailbox/outbox.jsonl` holds the six-digit code) and an administrator with
`npx tsx src/admin-cli.ts bootstrap --email <e-mail> --role SUPER_ADMIN --password-stdin`. Keep credentials outside the repository (for example `~/mmri-secrets/`).
