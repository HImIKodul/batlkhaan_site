# MMRI production PostgreSQL least-privilege split

Use two separate database identities in production.

- `MMRI_MIGRATION_USER`: used only by the one-shot migration/import container. It may own/alter the MMRI schema objects.
- `MMRI_RUNTIME_USER`: used only by the API. It must not be superuser, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, or have CREATE on the `public` schema.

After migrations are installed, the runtime role needs only normal application DML rights on MMRI tables/sequences:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM MMRI_RUNTIME_USER;
GRANT USAGE ON SCHEMA public TO MMRI_RUNTIME_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO MMRI_RUNTIME_USER;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO MMRI_RUNTIME_USER;

-- Run these as the migration/object-owner role so future Prisma migrations inherit runtime grants.
ALTER DEFAULT PRIVILEGES FOR ROLE MMRI_MIGRATION_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO MMRI_RUNTIME_USER;
ALTER DEFAULT PRIVILEGES FOR ROLE MMRI_MIGRATION_USER IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO MMRI_RUNTIME_USER;
```

Replace role placeholders with the actual DigitalOcean PostgreSQL role names. Do not run role/grant commands against production until the actual managed-database permissions are known.

Connected verification command (later release step):

```bash
cd backend
NODE_ENV=production npm run db:verify:backend-production-security
```

The verifier fails if the API is using an administrative PostgreSQL role, if the runtime role can create schema objects, or if persistent report storage is unavailable/world-writable.
