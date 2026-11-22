-- Company logo (development/QA first; applied to production only through the normal release process).
CREATE TABLE "company_logo_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_logo_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_logo_assets_companyId_sha256_key" ON "company_logo_assets"("companyId", "sha256");
CREATE INDEX "company_logo_assets_companyId_idx" ON "company_logo_assets"("companyId");
ALTER TABLE "company_logo_assets" ADD CONSTRAINT "company_logo_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companies" ADD COLUMN "logoAssetId" TEXT;
ALTER TABLE "companies" ADD CONSTRAINT "companies_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "company_logo_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
