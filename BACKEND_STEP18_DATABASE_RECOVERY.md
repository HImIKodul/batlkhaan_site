# Backend Step 18/20 — Database, Migration, Backup & Recovery Readiness

## Completed in source package
- Frozen SHA-256 fingerprint over all 25 committed Prisma migrations.
- Production preflight rejects any edited/reordered migration chain.
- One-shot connected production DB gate applies committed migrations with the migration role, checks `prisma migrate status`, imports/verifies the current frozen methodology, then switches to the least-privilege runtime role for DB integrity verification.
- Runtime DB verification checks role flags, schema CREATE denial, DML privileges on application tables, sequence privileges, and persistent report-storage writeability.
- PostgreSQL and report-storage backups can be produced as one coordinated `MMRI-BACKUP-SET-1.0` with a release SHA, migration-chain SHA and artifact hashes.
- Backup-set verification detects dump/archive corruption or tampering before restore.
- Restore drills require isolated `RECOVERY_DATABASE_URL` and `RECOVERY_REPORT_STORAGE_DIR` targets by default.
- Live/production destructive restore requires a second explicit override.
- Report restore rejects archive traversal paths.

## Source verification
```bash
cd backend
npm run backend:step18:db:verify
```

## Connected production-like DB gate (later)
Run from `backend/` with the exact production-like secrets/configuration loaded:
```bash
NODE_ENV=production bash scripts/connected-production-db-gate.sh
```
This requires reachable PostgreSQL and installed dependencies. Do not point it at an unreviewed production database until backups and role grants are in place.

## Coordinated backup
From repository root:
```bash
DATABASE_URL='postgresql://...' \
MMRI_REPORT_STORAGE_DIR='/var/lib/mmri/report-storage' \
RELEASE_SHA='...' \
bash ops/backup-all.sh
```

## Isolated restore drill
```bash
ALLOW_DESTRUCTIVE_RESTORE=YES \
RECOVERY_DATABASE_URL='postgresql://...isolated-recovery...' \
RECOVERY_REPORT_STORAGE_DIR='/var/lib/mmri/recovery-report-storage' \
bash ops/restore-backup-set.sh /path/to/mmri-backup-set-...
```

## Connected-only HOLD
This sandbox has no live PostgreSQL server/client. Therefore the real migration execution, DigitalOcean role privilege verification, and real pg_dump/pg_restore drill remain connected-runtime checks for the deployment phase. No source-only result is represented as a live database PASS.
