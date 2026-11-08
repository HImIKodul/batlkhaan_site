# MMRI Backend API v1.4.0 + Strategy/Report v1.3.0

Production-oriented backend around **MMRI methodology v1.0.1 LOCKED**.

The API now exposes **31 total routes: 30 `/api/v1` routes plus `/health`**. v1.4.0 adds company assessment-history retrieval required for fresh-login save/resume and history UI, while preserving the locked diagnostic methodology and v1.3.0 strategy/report contracts.

## Verification status

- Engine smoke: **33/33 PASS**
- Engine locked regression: **84/84 PASS**
- Strategy/report regression: **31/31 PASS**
- Strategy/persistence static audit: **33/33 PASS**
- API/security static audit: **PASS — 31 total routes**

## Database setup

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:import
npm run db:verify
npm run api:dev
```

A genuine PostgreSQL/Prisma gate remains required because the packaging environment cannot run Docker/PostgreSQL.

## Key APIs

```text
GET   /api/v1/companies/:companyId/assessments
GET   /api/v1/assessments/:assessmentId/progress
GET   /api/v1/assessments/:assessmentId/results
GET   /api/v1/assessments/:assessmentId/diagnosis
GET   /api/v1/assessments/:assessmentId/recommendations
GET   /api/v1/assessments/:assessmentId/action-plan
PATCH /api/v1/assessments/:assessmentId/action-plan/milestones/:milestoneId
GET   /api/v1/assessments/:assessmentId/report
```

AI remains a renderer only; deterministic MMRI payloads remain authoritative.
