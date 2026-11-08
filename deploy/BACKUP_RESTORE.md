# MMRI Backup and Restore Contract — Backend Step 18/20

## Coordinated backup set
Production backups must capture PostgreSQL and the persistent report/PDF storage as one coordinated recovery set:

```bash
DATABASE_URL='postgresql://RUNTIME_OR_BACKUP_READER...' \
MMRI_REPORT_STORAGE_DIR='/var/lib/mmri/report-storage' \
RELEASE_SHA='immutable-release-sha' \
bash ops/backup-all.sh
```

The set contains:
- PostgreSQL custom-format dump + SHA-256 + metadata;
- report-storage gzip tar + SHA-256 + metadata;
- `BACKUP_SET.manifest` + SHA-256;
- exact release SHA and committed migration-chain SHA-256.

A set is invalid until:

```bash
bash ops/verify-backup-set.sh /path/to/mmri-backup-set-...
```

passes. All `.sha256` files and the set manifest record relative file names only (`<hash>  <basename>`), so a set may be copied to another directory or recovery host and verified there; verification ignores any directory prefix, so sets written by older versions (absolute paths) also verify. Verification checks both hashes, `pg_restore --list`, gzip/tar integrity, release binding, and migration-chain binding.

## Restore drills are isolated by default
Do not use the live `DATABASE_URL` or live report directory for a routine drill.

```bash
ALLOW_DESTRUCTIVE_RESTORE=YES \
RECOVERY_DATABASE_URL='postgresql://recovery-role@isolated-recovery-db/mmri_restore?sslmode=require' \
RECOVERY_REPORT_STORAGE_DIR='/var/lib/mmri/recovery-report-storage' \
bash ops/restore-backup-set.sh /path/to/mmri-backup-set-...
```

The PostgreSQL restore refuses `NODE_ENV=production` unless `ALLOW_PRODUCTION_RESTORE=YES` is separately supplied. The report restore refuses the live report-storage target unless `ALLOW_LIVE_REPORT_RESTORE=YES` is separately supplied.

## Required production policy
- automated daily coordinated backup set;
- encrypted backup storage with backup credentials separated from application credentials;
- alert on missing/failed backup;
- retain backups according to the approved operating policy (35 days remains the current recommendation);
- monthly isolated recovery drill;
- record recovery evidence, elapsed restore time, RPO/RTO, release SHA, migration-chain SHA and checksum results;
- run database/security/smoke checks after restore before trusting the recovered environment.

Application rollback uses the previous immutable application image. Database restore is disaster recovery, not the routine application rollback mechanism.

## Report-storage volume ownership (production compose)
The `migrate` and `api` images both create `/var/lib/mmri/report-storage` owned by the non-root `mmri` user (uid/gid 10001). A fresh `mmri_report_storage` named volume inherits that ownership. A volume created by an earlier release is root-owned and must be fixed once, before the first start of the new release:

```bash
docker run --rm --user 0 --entrypoint chown -v mmri_report_storage:/v "$MMRI_API_IMAGE" -R 10001:10001 /v
```
