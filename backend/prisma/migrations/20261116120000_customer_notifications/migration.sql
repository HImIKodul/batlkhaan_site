-- Additive migration: server-side customer notifications (read / dismissed state per recipient).
-- No existing table is rewritten. Rollback (see docs/CUSTOMER_NOTIFICATIONS.md): DROP TABLE "customer_notifications";
CREATE TABLE "customer_notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "companyId" TEXT REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "payload" JSONB,
  "eventRef" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  CONSTRAINT "customer_notifications_type_check" CHECK ("type" IN (
    'PAYMENT_CONFIRMED','ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_APPROVED','REPORT_RELEASED',
    'ACCOUNT_EMAIL_VERIFIED','ACCOUNT_PASSWORD_CHANGED')),
  CONSTRAINT "customer_notifications_destination_check" CHECK ("destination" IN ('home','analysis','results','report','billing','profile','settings')),
  CONSTRAINT "customer_notifications_title_len" CHECK (char_length("title") BETWEEN 1 AND 200),
  CONSTRAINT "customer_notifications_message_len" CHECK (char_length("message") BETWEEN 1 AND 1000)
);
-- One notification per recipient per event: event generation is idempotent.
CREATE UNIQUE INDEX "customer_notifications_userId_dedupeKey_key" ON "customer_notifications"("userId", "dedupeKey");
-- Newest-first listing and unread counting for one recipient (optionally one company).
CREATE INDEX "customer_notifications_user_created_idx" ON "customer_notifications"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "customer_notifications_company_idx" ON "customer_notifications"("companyId");
