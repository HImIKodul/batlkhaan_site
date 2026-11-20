-- One editor per report at a time (server-authoritative lock with expiry). Additive: two nullable columns.
ALTER TABLE "report_reviews" ADD COLUMN "lockedByAdminId" TEXT;
ALTER TABLE "report_reviews" ADD COLUMN "lockExpiresAt" TIMESTAMP(3);
