-- MMRI Step 7/7 domain-scoped five-domain integration.
ALTER TABLE "methodology_versions" ADD COLUMN IF NOT EXISTS "domainCode" TEXT NOT NULL DEFAULT 'marketing';
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "domainCode" TEXT NOT NULL DEFAULT 'marketing';
ALTER TABLE "company_entitlements" ADD COLUMN IF NOT EXISTS "domainCode" TEXT NOT NULL DEFAULT 'marketing';
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "domainCode" TEXT NOT NULL DEFAULT 'marketing';
ALTER TABLE "diagnostic_cells" ADD COLUMN IF NOT EXISTS "weightPctOverride" DECIMAL(12,8);
CREATE INDEX IF NOT EXISTS "billing_invoices_companyId_domainCode_status_idx" ON "billing_invoices"("companyId","domainCode","status");
CREATE INDEX IF NOT EXISTS "company_entitlements_companyId_domainCode_status_idx" ON "company_entitlements"("companyId","domainCode","status");
CREATE INDEX IF NOT EXISTS "assessments_companyId_domainCode_createdAt_idx" ON "assessments"("companyId","domainCode","createdAt");
