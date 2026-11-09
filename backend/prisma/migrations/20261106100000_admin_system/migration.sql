-- Admin system (additive only): admin accounts and sessions, report review workflow (reviews, immutable revisions, AI suggestions),
-- admin notifications, payment disputes, support cases and the admin audit log. No existing table or row is changed.

CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
  "role" TEXT NOT NULL CHECK ("role" IN ('SUPER_ADMIN','REPORT_REVIEWER','BILLING_REVIEWER')),
  "status" TEXT NOT NULL DEFAULT 'PENDING_MFA' CHECK ("status" IN ('PENDING_MFA','ACTIVE','DISABLED')),
  "mfaSecretEnc" TEXT,
  "mfaLastStep" BIGINT NOT NULL DEFAULT 0,
  "failedLogins" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" TEXT PRIMARY KEY,
  "adminId" TEXT NOT NULL REFERENCES "admin_accounts"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "reauthAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "ipHash" TEXT,
  "userAgentHash" TEXT
);
CREATE INDEX IF NOT EXISTS "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");

CREATE TABLE IF NOT EXISTS "report_reviews" (
  "id" TEXT PRIMARY KEY,
  "assessmentId" TEXT NOT NULL UNIQUE REFERENCES "assessments"("id") ON DELETE RESTRICT,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "domainCode" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('SUBMITTED','GENERATING_DRAFT','AWAITING_REVIEW','IN_REVIEW','READY_FOR_APPROVAL','APPROVED','PUBLISHED','GENERATION_FAILED')),
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "draftGeneratedAt" TIMESTAMP(3),
  "assignedAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "currentRevision" INTEGER NOT NULL DEFAULT 0,
  "approvedAt" TIMESTAMP(3),
  "approvedByAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "publishedAt" TIMESTAMP(3),
  "publishedByAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "publishedRevision" INTEGER,
  "remindersSent" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lastError" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "report_reviews_status_deadline_idx" ON "report_reviews"("status","deadlineAt");
CREATE INDEX IF NOT EXISTS "report_reviews_company_idx" ON "report_reviews"("companyId");

CREATE TABLE IF NOT EXISTS "report_review_revisions" (
  "id" TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES "report_reviews"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL,
  "narrative" JSONB NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('GENERATED','MANUAL','AI_APPLIED','RESTORED')),
  "reason" TEXT,
  "changedClaims" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdByAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("reviewId","revision")
);

CREATE TABLE IF NOT EXISTS "report_review_suggestions" (
  "id" TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES "report_reviews"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL,
  "claimId" TEXT NOT NULL,
  "original" TEXT NOT NULL,
  "suggested" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "warning" TEXT NOT NULL DEFAULT 'NONE',
  "source" TEXT NOT NULL DEFAULT 'MOCK',
  "status" TEXT NOT NULL DEFAULT 'PROPOSED' CHECK ("status" IN ('PROPOSED','APPLIED','REJECTED')),
  "decidedByAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "report_review_suggestions_review_idx" ON "report_review_suggestions"("reviewId","status");

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL UNIQUE,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "admin_notifications_created_idx" ON "admin_notifications"("createdAt" DESC);
CREATE TABLE IF NOT EXISTS "admin_notification_reads" (
  "adminId" TEXT NOT NULL REFERENCES "admin_accounts"("id") ON DELETE CASCADE,
  "notificationId" TEXT NOT NULL REFERENCES "admin_notifications"("id") ON DELETE CASCADE,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("adminId","notificationId")
);

CREATE TABLE IF NOT EXISTS "payment_disputes" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT NOT NULL REFERENCES "billing_invoices"("id") ON DELETE RESTRICT,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','RESOLVED')),
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "summary" TEXT NOT NULL,
  "openedByUserId" TEXT REFERENCES "users"("id"),
  "assignedAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "refundApprovedAt" TIMESTAMP(3),
  "refundExecutedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "payment_disputes_status_idx" ON "payment_disputes"("status","createdAt");
CREATE TABLE IF NOT EXISTS "payment_dispute_events" (
  "id" TEXT PRIMARY KEY,
  "disputeId" TEXT NOT NULL REFERENCES "payment_disputes"("id") ON DELETE RESTRICT,
  "adminId" TEXT REFERENCES "admin_accounts"("id"),
  "userId" TEXT REFERENCES "users"("id"),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NOTE','INFO_REQUEST','CUSTOMER_REPLY','STATUS','DECISION')),
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "support_cases" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT REFERENCES "companies"("id") ON DELETE RESTRICT,
  "userId" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "category" TEXT NOT NULL CHECK ("category" IN ('ACCOUNT_ACCESS','COMPANY_DETAILS','REPORT_QUESTION','PAYMENT_DISPUTE','TECHNICAL_ERROR','REPORT_REVIEW_REQUEST','DATA_REQUEST')),
  "priority" TEXT NOT NULL DEFAULT 'NORMAL' CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT')),
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  "subject" TEXT NOT NULL,
  "assignedAdminId" TEXT REFERENCES "admin_accounts"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "support_cases_status_idx" ON "support_cases"("status","createdAt");
CREATE TABLE IF NOT EXISTS "support_case_events" (
  "id" TEXT PRIMARY KEY,
  "caseId" TEXT NOT NULL REFERENCES "support_cases"("id") ON DELETE RESTRICT,
  "adminId" TEXT REFERENCES "admin_accounts"("id"),
  "userId" TEXT REFERENCES "users"("id"),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NOTE','CUSTOMER_MESSAGE','STATUS','RESOLUTION')),
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "admin_audit_events" (
  "id" TEXT PRIMARY KEY,
  "adminId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('SUCCESS','DENIED','FAILURE')),
  "ipHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "admin_audit_events_created_idx" ON "admin_audit_events"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_events_admin_idx" ON "admin_audit_events"("adminId","createdAt");

-- Append-only guarantees: revisions and audit events can never be updated or deleted by the application role.
CREATE OR REPLACE FUNCTION mmri_forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514'; END; $$;
DROP TRIGGER IF EXISTS "report_review_revisions_append_only" ON "report_review_revisions";
CREATE TRIGGER "report_review_revisions_append_only" BEFORE UPDATE OR DELETE ON "report_review_revisions" FOR EACH ROW EXECUTE FUNCTION mmri_forbid_row_change();
DROP TRIGGER IF EXISTS "admin_audit_events_append_only" ON "admin_audit_events";
CREATE TRIGGER "admin_audit_events_append_only" BEFORE UPDATE OR DELETE ON "admin_audit_events" FOR EACH ROW EXECUTE FUNCTION mmri_forbid_row_change();
