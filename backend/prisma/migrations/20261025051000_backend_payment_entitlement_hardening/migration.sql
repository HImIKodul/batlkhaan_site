-- Backend completion Step 13/20 — payment → entitlement → assessment integrity.

ALTER TABLE "billing_invoices"
  ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundReference" TEXT,
  ADD COLUMN IF NOT EXISTS "refundReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_refundReference_key"
  ON "billing_invoices"("refundReference")
  WHERE "refundReference" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "billing_invoices"
    WHERE "amountMnt" <= 0 OR "currency" <> 'MNT'
  ) THEN
    RAISE EXCEPTION 'Payment integrity preflight failed: invalid invoice amount/currency';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "billing_invoices"
    WHERE "status" IN ('PAID','REFUNDED')
      AND ("paidAt" IS NULL OR "providerPaymentId" IS NULL OR btrim("providerPaymentId")='')
  ) THEN
    RAISE EXCEPTION 'Payment integrity preflight failed: settled invoice lacks paidAt/providerPaymentId';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "billing_invoices"
    WHERE "status"='REFUNDED'
      AND ("refundedAt" IS NULL OR "refundReference" IS NULL OR btrim("refundReference")='')
  ) THEN
    RAISE EXCEPTION 'Payment integrity preflight failed: refunded invoice lacks refund metadata';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "company_entitlements" e
    JOIN "billing_invoices" i ON i."id"=e."sourceInvoiceId"
    WHERE e."companyId"<>i."companyId"
       OR e."domainCode"<>i."domainCode"
       OR e."planCode"<>i."planCode"
       OR (e."status" IN ('ACTIVE','CONSUMED') AND i."status"<>'PAID')
  ) THEN
    RAISE EXCEPTION 'Payment integrity preflight failed: entitlement/invoice mismatch';
  END IF;
END $$;

ALTER TABLE "billing_invoices"
  DROP CONSTRAINT IF EXISTS "billing_invoices_amount_currency_check";
ALTER TABLE "billing_invoices"
  ADD CONSTRAINT "billing_invoices_amount_currency_check"
  CHECK ("amountMnt">0 AND "currency"='MNT');

ALTER TABLE "billing_invoices"
  DROP CONSTRAINT IF EXISTS "billing_invoices_settlement_fields_check";
ALTER TABLE "billing_invoices"
  ADD CONSTRAINT "billing_invoices_settlement_fields_check"
  CHECK (
    ("status" NOT IN ('PAID','REFUNDED'))
    OR ("paidAt" IS NOT NULL AND "providerPaymentId" IS NOT NULL AND length(btrim("providerPaymentId")) BETWEEN 1 AND 220)
  );

ALTER TABLE "billing_invoices"
  DROP CONSTRAINT IF EXISTS "billing_invoices_refund_fields_check";
ALTER TABLE "billing_invoices"
  ADD CONSTRAINT "billing_invoices_refund_fields_check"
  CHECK (
    ("status"<>'REFUNDED' AND "refundedAt" IS NULL AND "refundReference" IS NULL)
    OR ("status"='REFUNDED' AND "refundedAt" IS NOT NULL AND "refundReference" IS NOT NULL AND length(btrim("refundReference")) BETWEEN 1 AND 200)
  );

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

DROP TRIGGER IF EXISTS "company_entitlements_source_invoice_guard" ON "company_entitlements";
CREATE TRIGGER "company_entitlements_source_invoice_guard"
BEFORE INSERT OR UPDATE OF "sourceInvoiceId","companyId","domainCode","planCode","status","assessmentLimit","assessmentsUsed"
ON "company_entitlements"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_entitlement_source_invoice();

CREATE OR REPLACE FUNCTION mmri_guard_invoice_refund_entitlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status"='REFUNDED' AND OLD."status"<>'REFUNDED' THEN
    UPDATE "company_entitlements"
       SET "status"='REVOKED',"endsAt"=COALESCE(NEW."refundedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP
     WHERE "sourceInvoiceId"=NEW."id" AND "status" IN ('ACTIVE','CONSUMED');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "billing_invoice_refund_entitlement_guard" ON "billing_invoices";
CREATE TRIGGER "billing_invoice_refund_entitlement_guard"
AFTER UPDATE OF "status","refundedAt"
ON "billing_invoices"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_invoice_refund_entitlement();
