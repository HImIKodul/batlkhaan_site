# BusinessMRI.mn final source structure

Status: local implementation prepared; acceptance remains blocked as detailed in `FINAL_ACCEPTANCE_REPORT.md` at the repository root. This is a source map, not a deployment claim.

```text
MMRI_STEP10_FINAL_WORKING/
├── backend/
│   ├── src/
│   │   ├── api/                 HTTP routes, config, auth, mail, admin, data lifecycle
│   │   ├── billing/             QPay adapters, invoice lifecycle, transaction ledger/entitlements
│   │   ├── engine/              Frozen scoring and adaptive routing
│   │   ├── services/            Persistence, strategy/report services, PDF artifacts
│   │   ├── report/              Report source/integrity, narrative provider boundary
│   │   ├── pilot/, calibration/ Research/validation workflows
│   │   └── domain-methodology.ts Active five-domain bundle pins
│   ├── prisma/
│   │   ├── schema.prisma        Additive ownership fields, token purposes, payment ledger
│   │   ├── migrations/          30 preserved migrations + 1 new additive migration
│   │   └── MIGRATION_CHAIN_SHA256.txt
│   ├── methodology/            Required frozen banks, manifests and retained provenance
│   ├── integration/            Required methodology acceptance evidence and imports
│   ├── pdf_renderer/           Deterministic three-page report renderer and fonts
│   ├── tests/                  Bounded critical service/route tests (mock DB)
│   ├── scripts/                Regression, provisioning, guarded real-DB acceptance tools
│   │   └── lib/                Shared guarded admin/verified-registration test helpers
│   ├── docs/                   API/security/data/report contracts
│   └── package*.json, tsconfig*.json, Dockerfile*
├── frontend/
│   ├── src/
│   │   ├── pages/              Customer pages, verification/recovery, report views
│   │   ├── admin/              SUPER_ADMIN/reviewer interface and tab-local client
│   │   ├── api/                Customer API/session client
│   │   ├── components/         Shared accessible controls and application shell
│   │   ├── design/             Current glass/material/motion tokens and styles
│   │   ├── data/, billing/     Question/profile/domain and pricing contracts
│   │   └── App.tsx             Routes, page titles and focus handling
│   ├── public/                Icons and current guide screenshots
│   ├── ds-lib/                Design-system package metadata
│   └── package*.json, index.html, vite*.ts, tsconfig*.json
├── qa/                        Browser, CSS, accessibility and interaction regressions
├── ops/                       Source/connected gates, backups, restore, preflight, scans
├── deploy/                    Configuration examples and operating/release runbooks
├── docs/
│   └── engineering/           Design contracts, progress, final source map and test runbook
├── CODEX_PROGRESS/
│   └── 02-critical-finalization/
│       ├── gates/             Individual security/config/migration/static check results
│       ├── browser/           Explicit blocked browser attempt and incremental result format
│       └── *.log, *.json, *.md Local results, test catalog, preservation/integrity evidence
├── STEP11_AUDIT/              Retained historical audit evidence
├── .github/workflows/         Existing release CI definition
├── README*.md, CLAUDE*.md     Entry points and historical implementation notes
├── START_LOCAL.sh, STOP_LOCAL.sh, RUN_*.sh, VERIFY_*.sh
├── STEP*.json/md/pdf/csv      Historical/current acceptance artifacts used by verifiers
└── FINAL_ACCEPTANCE_REPORT.md
```

Cleanup was conservative: removed an unused admin crypto import; removed an unused browser fixture registration; consolidated test account creation into one ownership-aware helper; scoped historical QA-admin cleanup to current invocation accounts; updated the README, public names and source map. The prior staged RimSheen deletion and CSS changes were preserved as found, with takeover patches retained. No source reset or overwrite from the separate design workspace occurred.

No methodology/question bank, migration, historical report, database, unique design work or necessary verification artifact was deleted. Some root acceptance files are still referenced by existing verifiers and were retained. Ignored methodology provenance remains on disk under the existing manifest policy. Generated `node_modules`, `dist`, engine/strategy output, runtime logs, local credentials and databases remain outside deliverable source under `.gitignore`. Local recovery patches/file lists in `CODEX_PROGRESS` are also ignored, while their files remain on disk. The source manifest records the current Git-visible candidates without shipping secrets or ignored provenance.

Earlier detailed checkpoint evidence remains at `/home/kirby/Downloads/BUSINESSMRI_FINAL_RELEASE/CODEX_PROGRESS`; this restricted session cannot write there. The source-local directory and `docs/engineering/CODEX_PROGRESS.md` contain continuation results and references. There is no clean-install or production packaging claim in this document.

Execution follow-up adds `ops/acceptance/` (read-only diagnostics, fixed-target host runner, design reconciliation and dependency evidence), the real-PDF inspection helper and private browser-fixture creator under `backend/scripts/`, plus root `DATABASE_FINAL_VERIFICATION.md`, `FINAL_SOURCE_CLEANUP_REPORT.md` and `REMAINING_BLOCKERS.md`. Normal-terminal phases and provider prerequisites are documented in `docs/engineering/LOCAL_ACCEPTANCE_COMMANDS.md` and `EXTERNAL_ACCEPTANCE_CHECKLIST.md`. These tools are prepared and guard/syntax checked; blocked service phases are not certified. Evidence for this continuation is in `CODEX_PROGRESS/03-executed-acceptance/`.
