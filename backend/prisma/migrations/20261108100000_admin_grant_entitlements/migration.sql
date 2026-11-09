-- Administrator-issued domain access ("ADMIN_GRANT"), modelled explicitly instead of as a fake paid invoice.
-- Additive: no row is rewritten, no invoice/payment/revenue row is created or touched, every existing entitlement keeps origin 'PAID' and its invoice.
-- (COALESCE matters: a CHECK that evaluates to NULL passes, so a missing reason must count as length 0.)
-- New rule enforced by the database: an entitlement is EITHER paid (has a source invoice) OR an administrator grant (no invoice, named admin, written reason).
CREATE TYPE "EntitlementOrigin" AS ENUM ('PAID', 'ADMIN_GRANT');

ALTER TABLE "company_entitlements"
  ADD COLUMN "origin" "EntitlementOrigin" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "grantedByAdminId" TEXT,
  ADD COLUMN "grantReason" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByAdminId" TEXT,
  ADD COLUMN "revokeReason" TEXT;

ALTER TABLE "company_entitlements" ALTER COLUMN "sourceInvoiceId" DROP NOT NULL;

ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_origin_check" CHECK (
  ("origin" = 'PAID' AND "sourceInvoiceId" IS NOT NULL AND "grantedByAdminId" IS NULL AND "grantReason" IS NULL)
  OR
  ("origin" = 'ADMIN_GRANT' AND "sourceInvoiceId" IS NULL AND "grantedByAdminId" IS NOT NULL AND COALESCE(length(btrim("grantReason")), 0) >= 8)
);
-- A revoked administrator grant must say who revoked it and why (paid entitlements are revoked only through the refund path and keep their invoice).
ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_admin_revoke_check" CHECK (
  "origin" = 'PAID' OR "status" <> 'REVOKED' OR ("revokedByAdminId" IS NOT NULL AND COALESCE(length(btrim("revokeReason")), 0) >= 8 AND "revokedAt" IS NOT NULL)
);

ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_grantedByAdminId_fkey" FOREIGN KEY ("grantedByAdminId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_entitlements" ADD CONSTRAINT "company_entitlements_revokedByAdminId_fkey" FOREIGN KEY ("revokedByAdminId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "company_entitlements_origin_status_idx" ON "company_entitlements"("origin", "status");

-- The insert/update guard trigger validates the source invoice; it must accept invoice-less ADMIN_GRANT rows (and keep every rule for PAID rows).
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
  -- Administrator grants (origin ADMIN_GRANT) have no invoice by design; the table CHECK company_entitlements_origin_check guarantees the admin and the reason.
  -- Only the invoice-related rules are skipped for them; the usage-limit rules below still apply.
  IF NEW."origin"='ADMIN_GRANT' THEN
    IF NEW."assessmentLimit" IS NOT NULL AND NEW."assessmentLimit"<1 THEN
      RAISE EXCEPTION 'Entitlement assessmentLimit must be positive' USING ERRCODE='23514';
    END IF;
    IF NEW."assessmentsUsed"<0 OR (NEW."assessmentLimit" IS NOT NULL AND NEW."assessmentsUsed">NEW."assessmentLimit") THEN
      RAISE EXCEPTION 'Entitlement usage is outside its assessment limit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

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
