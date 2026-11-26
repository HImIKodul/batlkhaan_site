-- Administrator e-mail verification codes (feature-flagged, off by default). Additive only: one new table, nothing existing is altered or dropped.
CREATE TABLE "admin_email_challenges" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_email_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_email_challenges_adminId_createdAt_idx" ON "admin_email_challenges"("adminId", "createdAt");
CREATE INDEX "admin_email_challenges_expiresAt_idx" ON "admin_email_challenges"("expiresAt");
ALTER TABLE "admin_email_challenges" ADD CONSTRAINT "admin_email_challenges_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
