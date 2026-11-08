-- Manual rollback for 20261108100000_admin_grant_entitlements (not run by Prisma).
-- SAFE BY DEFAULT: it refuses to run while any ADMIN_GRANT entitlement exists, because dropping the columns would silently erase who granted access and why,
-- and an invoice-less row cannot satisfy the restored NOT NULL on "sourceInvoiceId". Export those rows first (SELECT * FROM company_entitlements WHERE origin='ADMIN_GRANT'),
-- then decide: keep the migration, or delete the grants explicitly after approval. Nothing in billing_invoices is ever touched by this migration or its rollback.
-- After a successful rollback also run: DELETE FROM _prisma_migrations WHERE migration_name='20261108100000_admin_grant_entitlements';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "company_entitlements" WHERE "origin" = 'ADMIN_GRANT') THEN
    RAISE EXCEPTION 'rollback refused: ADMIN_GRANT entitlements exist (export and resolve them first)';
  END IF;
END $$;
-- restore the original guard function (identical to migration 20261025051000)
CREATE OR REPLACE FUNCTION mmri_guard_entitlement_source_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company TEXT;
  v_domain TEXT;
  v_plan "BillingPlanCode";
  v_status "BillingInvoiceStatus";
BEGIN
  SELECT i."companyId",i."domainCode",i."planCode",i."status"
    INTO v_company,v_domain,v_plan,v_status
  FROM "billing_invoices" i
  WHERE i."id"=NEW."sourceInvoiceId";

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Entitlement source invoice does not exist' USING ERRCODE='23503';
  END IF;

  IF NEW."companyId"<>v_company OR NEW."domainCode"<>v_domain OR NEW."planCode"<>v_plan THEN
    RAISE EXCEPTION 'Entitlement must match source invoice company/domain/plan' USING ERRCODE='23514';
  END IF;

  IF NEW."status" IN ('ACTIVE','CONSUMED') AND v_status<>'PAID' THEN
    RAISE EXCEPTION 'Active/consumed entitlement requires a PAID source invoice' USING ERRCODE='23514';
  END IF;

  IF NEW."assessmentLimit" IS NOT NULL AND NEW."assessmentLimit"<1 THEN
    RAISE EXCEPTION 'Entitlement assessmentLimit must be positive' USING ERRCODE='23514';
  END IF;
  IF NEW."assessmentsUsed"<0 OR (NEW."assessmentLimit" IS NOT NULL AND NEW."assessmentsUsed">NEW."assessmentLimit") THEN
    RAISE EXCEPTION 'Entitlement usage is outside its assessment limit' USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$;
DROP INDEX IF EXISTS "company_entitlements_origin_status_idx";
ALTER TABLE "company_entitlements" DROP CONSTRAINT IF EXISTS "company_entitlements_revokedByAdminId_fkey";
ALTER TABLE "company_entitlements" DROP CONSTRAINT IF EXISTS "company_entitlements_grantedByAdminId_fkey";
ALTER TABLE "company_entitlements" DROP CONSTRAINT IF EXISTS "company_entitlements_admin_revoke_check";
ALTER TABLE "company_entitlements" DROP CONSTRAINT IF EXISTS "company_entitlements_origin_check";
ALTER TABLE "company_entitlements" ALTER COLUMN "sourceInvoiceId" SET NOT NULL;
ALTER TABLE "company_entitlements" DROP COLUMN IF EXISTS "revokeReason", DROP COLUMN IF EXISTS "revokedByAdminId", DROP COLUMN IF EXISTS "revokedAt",
  DROP COLUMN IF EXISTS "grantReason", DROP COLUMN IF EXISTS "grantedByAdminId", DROP COLUMN IF EXISTS "origin";
DROP TYPE IF EXISTS "EntitlementOrigin";
