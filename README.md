# BusinessMRI (businessmri.mn)

Business-diagnosis platform: five domains (Marketing, Information Technology, Finance, Human Resources, Production & Operations), 61,440 questions
(12,288 per domain; 64 capabilities and 3,072 cell instances per domain), PostgreSQL, TypeScript/Node.js backend, React/Vite frontend,
three-page A4 diagnostic report, twelve-month action plan, QPay billing and entitlements, customer and SUPER_ADMIN interfaces.

Runtime: Node 22.16.x, npm 10.9.x (see `.nvmrc`, `package.json` engines; lockfiles are exact).

| Topic | Where |
|---|---|
| Working rules, frozen product rules | `CLAUDE.md`, `MMRI_DESIGN_SYSTEM_HANDOFF.md`, `CLAUDE_PROGRESS.md` |
| Local run / stop / reset | `README_LINUX.md`, `START_LOCAL.sh`, `STOP_LOCAL.sh`, `RESET_LOCAL_DB.sh` |
| Backend & frontend | `backend/README.md`, `backend/docs/`, `frontend/README.md`, `frontend/src/design/README.md` |
| Backend engineering design (auth, lifecycle, scoring, findings, plan, AI boundary, PDF, payment, recovery, security, operations) | `docs/engineering/` |
| Database & migrations | `backend/prisma/migrations/` (each migration is immutable; chain fingerprint in `backend/prisma/MIGRATION_CHAIN_SHA256.txt` and `deploy/MIGRATION_CHAIN_SHA256.txt`; verify with `node ops/migration-chain.mjs --verify`) |
| Methodology bundles | `backend/methodology/`; pins in `backend/src/domain-methodology.ts`; `deploy/METHODOLOGY_VERSIONING_POLICY.md` |
| Install the five bundles on a database | `cd backend && MMRI_PROVISION_FIVE_DOMAINS_OK=YES MMRI_ENVIRONMENT=<env> npm run domains:provision` (add `MMRI_PROVISION_ACTIVATE=YES` to activate); read-only check: `MMRI_EXPECT_DOMAIN_STATUS=ACTIVE npm run domains:verify:provisioning` |
| Deployment, backup/restore, observability | `deploy/RELEASE_RUNBOOK.md`, `deploy/DEDICATED_SERVER_SETUP.md`, `deploy/BACKUP_RESTORE.md`, `deploy/OBSERVABILITY.md`, `deploy/POSTGRES_LEAST_PRIVILEGE.md`, `ops/` |
| Security & environment variables | `backend/.env.example`, `backend/docs/API_SECURITY.md`, `deploy/EXTERNAL_REQUIREMENTS.md` |
| QA checklist, source policy | `docs/QA_CHECKLIST.md`, `docs/CLEAN_SOURCE_POLICY.md` |
| Customer-flow regressions (isolated stack, synthetic users only) | `cd backend && npm run qa:onboarding-save` (20-question save/reload/isolation), `npm run qa:proxy-ip`; UI: `qa/ui-onboarding-save.mjs`, `qa/ui-auth-register.mjs` |
| Reverse proxy / IIS | `TRUST_PROXY=true` and `TRUST_PROXY_HOPS` are mandatory behind IIS/ARR or nginx (otherwise all visitors share one rate-limit bucket); see `deploy/WINDOWS_SERVER_DEPLOYMENT.md` |
| Release verification | `bash ops/release-gate.sh` (source gate), `bash VERIFY_UI_POLISH.sh`, `bash VERIFY_STEP11_FULL_REGRESSION.sh`, CI: `.github/workflows/release-gate.yml` |
