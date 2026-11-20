-- Additive migration: exactly-once bookkeeping for lifecycle e-mails (customer acknowledgements, report status, administrator review alerts).
-- A row is the claim on one message (dedupeKey = '<scope>:<source id>'); sentAt is set only after the provider accepted it. Rollback: DROP TABLE "mail_dispatch_marks";
CREATE TABLE "mail_dispatch_marks" (
  "dedupeKey" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_dispatch_marks_attempts_check" CHECK ("attempts" BETWEEN 0 AND 20),
  CONSTRAINT "mail_dispatch_marks_kind_check" CHECK ("kind" IN ('ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED','ADMIN_REVIEW_ALERT'))
);
CREATE INDEX "mail_dispatch_marks_due_idx" ON "mail_dispatch_marks"("sentAt", "nextAttemptAt");
