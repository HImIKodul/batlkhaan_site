-- Backend completion Step 02/20 — database/data-model integrity hardening.
-- This migration fails fast if legacy rows violate relationships that the application
-- already assumes, then lets PostgreSQL enforce those assumptions permanently.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "assessments" a
    LEFT JOIN "assessment_asked_questions" q ON q."id" = a."currentQuestionIssueId"
    WHERE a."currentQuestionIssueId" IS NOT NULL
      AND (q."id" IS NULL OR q."assessmentId" <> a."id")
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: invalid assessments.currentQuestionIssueId';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "assessments" a
    LEFT JOIN "assessments" p ON p."id" = a."parentAssessmentId"
    WHERE a."parentAssessmentId" IS NOT NULL
      AND (
        p."id" IS NULL OR p."id" = a."id" OR
        p."companyId" <> a."companyId" OR p."domainCode" <> a."domainCode"
      )
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: invalid assessment parent lineage';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "assessments" a
    LEFT JOIN "assessments" p ON p."id" = a."previousAssessmentId"
    WHERE a."previousAssessmentId" IS NOT NULL
      AND (
        p."id" IS NULL OR p."id" = a."id" OR
        p."companyId" <> a."companyId" OR p."domainCode" <> a."domainCode"
      )
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: invalid assessment previous lineage';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "assessments" a
    JOIN "company_entitlements" e ON e."id" = a."entitlementId"
    WHERE a."entitlementId" IS NOT NULL
      AND (e."companyId" <> a."companyId" OR e."domainCode" <> a."domainCode")
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: assessment entitlement company/domain mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "company_entitlements" e
    JOIN (
      SELECT "entitlementId", COUNT(*)::INTEGER AS used_count
      FROM "assessments"
      WHERE "entitlementId" IS NOT NULL
      GROUP BY "entitlementId"
    ) x ON x."entitlementId" = e."id"
    WHERE e."assessmentLimit" IS NOT NULL AND x.used_count > e."assessmentLimit"
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: entitlement assessment limit exceeded';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "answer_events" e
    JOIN "assessments" a ON a."id" = e."assessmentId"
    LEFT JOIN "assessment_asked_questions" qi ON qi."id" = e."questionIssueId"
    LEFT JOIN "answers" ans ON ans."id" = e."answerId"
    LEFT JOIN "questions" q ON q."id" = e."questionId"
    LEFT JOIN "assessment_respondents" r ON r."id" = e."respondentId"
    WHERE qi."id" IS NULL OR ans."id" IS NULL OR q."id" IS NULL
       OR (e."respondentId" IS NOT NULL AND r."id" IS NULL)
       OR qi."assessmentId" <> e."assessmentId"
       OR ans."assessmentId" <> e."assessmentId"
       OR (r."id" IS NOT NULL AND r."assessmentId" <> e."assessmentId")
       OR qi."questionId" <> e."questionId"
       OR ans."questionId" <> e."questionId"
       OR q."methodologyVersionId" <> a."methodologyVersionId"
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: detached/cross-assessment answer event';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "response_drafts" d
    JOIN "assessments" a ON a."id" = d."assessmentId"
    LEFT JOIN "assessment_asked_questions" qi ON qi."id" = d."questionIssueId"
    LEFT JOIN "questions" q ON q."id" = d."questionId"
    WHERE qi."id" IS NULL OR q."id" IS NULL
       OR qi."assessmentId" <> d."assessmentId"
       OR qi."questionId" <> d."questionId"
       OR q."methodologyVersionId" <> a."methodologyVersionId"
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: detached/cross-assessment response draft';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "report_snapshots" r
    LEFT JOIN "assessment_state_snapshots" s ON s."id" = r."sourceSnapshotId"
    WHERE r."sourceSnapshotId" IS NOT NULL
      AND (s."id" IS NULL OR s."assessmentId" <> r."assessmentId")
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: report source snapshot mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "trace_snapshots" t
    LEFT JOIN "report_snapshots" r ON r."id" = t."reportSnapshotId"
    WHERE t."reportSnapshotId" IS NOT NULL
      AND (r."id" IS NULL OR r."assessmentId" <> t."assessmentId")
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: trace/report snapshot mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "billing_invoices"
    WHERE "providerPaymentId" IS NOT NULL
    GROUP BY "providerPaymentId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: duplicate provider payment IDs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "assessments"
    WHERE "status" IN ('PROFILE_PENDING','IN_PROGRESS','PAUSED','READY_FOR_COMPLETION','PROCESSING')
    GROUP BY "companyId", "domainCode"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Integrity preflight failed: multiple active assessments for a company/domain';
  END IF;
END $$;

-- One external payment may settle only one local invoice.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_providerPaymentId_key"
  ON "billing_invoices"("providerPaymentId");

-- At most one live assessment may exist for a company/domain, even under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS "assessments_one_active_company_domain_key"
  ON "assessments"("companyId", "domainCode")
  WHERE "status" IN ('PROFILE_PENDING','IN_PROGRESS','PAUSED','READY_FOR_COMPLETION','PROCESSING');

-- An issued question row may be the current pointer of only one assessment.
DROP INDEX IF EXISTS "assessments_currentQuestionIssueId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "assessments_currentQuestionIssueId_key"
  ON "assessments"("currentQuestionIssueId");

CREATE INDEX IF NOT EXISTS "assessments_parentAssessmentId_idx"
  ON "assessments"("parentAssessmentId");
CREATE INDEX IF NOT EXISTS "assessments_previousAssessmentId_idx"
  ON "assessments"("previousAssessmentId");
CREATE INDEX IF NOT EXISTS "answer_events_questionIssueId_idx"
  ON "answer_events"("questionIssueId");
CREATE INDEX IF NOT EXISTS "answer_events_answerId_idx"
  ON "answer_events"("answerId");
CREATE INDEX IF NOT EXISTS "answer_events_respondentId_idx"
  ON "answer_events"("respondentId");
CREATE INDEX IF NOT EXISTS "report_snapshots_sourceSnapshotId_idx"
  ON "report_snapshots"("sourceSnapshotId");
CREATE INDEX IF NOT EXISTS "trace_snapshots_reportSnapshotId_idx"
  ON "trace_snapshots"("reportSnapshotId");

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_currentQuestionIssueId_fkey"
  FOREIGN KEY ("currentQuestionIssueId") REFERENCES "assessment_asked_questions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_parentAssessmentId_fkey"
  FOREIGN KEY ("parentAssessmentId") REFERENCES "assessments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_previousAssessmentId_fkey"
  FOREIGN KEY ("previousAssessmentId") REFERENCES "assessments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "answer_events"
  ADD CONSTRAINT "answer_events_questionIssueId_fkey"
  FOREIGN KEY ("questionIssueId") REFERENCES "assessment_asked_questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "answer_events"
  ADD CONSTRAINT "answer_events_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "answer_events"
  ADD CONSTRAINT "answer_events_answerId_fkey"
  FOREIGN KEY ("answerId") REFERENCES "answers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "answer_events"
  ADD CONSTRAINT "answer_events_respondentId_fkey"
  FOREIGN KEY ("respondentId") REFERENCES "assessment_respondents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "response_drafts"
  ADD CONSTRAINT "response_drafts_questionIssueId_fkey"
  FOREIGN KEY ("questionIssueId") REFERENCES "assessment_asked_questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "response_drafts"
  ADD CONSTRAINT "response_drafts_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_snapshots"
  ADD CONSTRAINT "report_snapshots_sourceSnapshotId_fkey"
  FOREIGN KEY ("sourceSnapshotId") REFERENCES "assessment_state_snapshots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trace_snapshots"
  ADD CONSTRAINT "trace_snapshots_reportSnapshotId_fkey"
  FOREIGN KEY ("reportSnapshotId") REFERENCES "report_snapshots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
