-- Backend completion Step 04/20 — diagnosis lifecycle/state integrity.
-- Goals:
--   * no more than one open question per assessment;
--   * current-question pointers always point to an ISSUED question from the same assessment;
--   * paused/terminal rows cannot retain incompatible writer/resume state;
--   * terminal assessments cannot be reopened by a later status update;
--   * terminal assessments cannot retain an unanswered issued question.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "assessment_asked_questions"
    WHERE "status"='ISSUED'
    GROUP BY "assessmentId"
    HAVING COUNT(*)>1
  ) THEN
    RAISE EXCEPTION 'Lifecycle preflight failed: assessment has multiple ISSUED questions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "assessments" a
    LEFT JOIN "assessment_asked_questions" q ON q."id"=a."currentQuestionIssueId"
    WHERE a."currentQuestionIssueId" IS NOT NULL
      AND (q."id" IS NULL OR q."assessmentId"<>a."id" OR q."status"<>'ISSUED')
  ) THEN
    RAISE EXCEPTION 'Lifecycle preflight failed: invalid current question pointer';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_asked_questions_one_open_per_assessment_key"
  ON "assessment_asked_questions"("assessmentId")
  WHERE "status"='ISSUED';

CREATE OR REPLACE FUNCTION mmri_guard_assessment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_issue_assessment_id TEXT;
  v_issue_status "QuestionIssueStatus";
BEGIN
  IF TG_OP='UPDATE'
     AND OLD."status" IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED','CANCELLED')
     AND NEW."status"<>OLD."status" THEN
    RAISE EXCEPTION 'Terminal assessment status cannot be reopened (% -> %)', OLD."status", NEW."status"
      USING ERRCODE='23514';
  END IF;

  IF NEW."currentQuestionIssueId" IS NOT NULL THEN
    SELECT q."assessmentId", q."status"
      INTO v_issue_assessment_id, v_issue_status
      FROM "assessment_asked_questions" q
      WHERE q."id"=NEW."currentQuestionIssueId";
    IF v_issue_assessment_id IS NULL
       OR v_issue_assessment_id<>NEW."id"
       OR v_issue_status<>'ISSUED' THEN
      RAISE EXCEPTION 'currentQuestionIssueId must reference an ISSUED question from the same assessment'
        USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."status"='PROFILE_PENDING' THEN
    IF NEW."completedAt" IS NOT NULL OR NEW."pausedAt" IS NOT NULL
       OR NEW."activeWriterLeaseId" IS NOT NULL OR NEW."writerLeaseExpiresAt" IS NOT NULL THEN
      RAISE EXCEPTION 'PROFILE_PENDING assessment contains incompatible lifecycle fields'
        USING ERRCODE='23514';
    END IF;
  ELSIF NEW."status"='IN_PROGRESS' THEN
    IF NEW."startedAt" IS NULL OR NEW."completedAt" IS NOT NULL OR NEW."pausedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'IN_PROGRESS assessment requires startedAt and no completedAt/pausedAt'
        USING ERRCODE='23514';
    END IF;
  ELSIF NEW."status"='PAUSED' THEN
    IF NEW."startedAt" IS NULL OR NEW."pausedAt" IS NULL OR NEW."completedAt" IS NOT NULL
       OR NEW."activeWriterLeaseId" IS NOT NULL OR NEW."writerLeaseExpiresAt" IS NOT NULL THEN
      RAISE EXCEPTION 'PAUSED assessment lifecycle fields are inconsistent'
        USING ERRCODE='23514';
    END IF;
  ELSIF NEW."status" IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') THEN
    IF NEW."completedAt" IS NULL OR NEW."currentQuestionIssueId" IS NOT NULL
       OR NEW."activeWriterLeaseId" IS NOT NULL OR NEW."writerLeaseExpiresAt" IS NOT NULL
       OR NEW."pausedAt" IS NOT NULL OR NEW."resumeState" IS NOT NULL THEN
      RAISE EXCEPTION 'Terminal result assessment lifecycle fields are inconsistent'
        USING ERRCODE='23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "assessment_asked_questions" q
      WHERE q."assessmentId"=NEW."id" AND q."status"='ISSUED'
    ) THEN
      RAISE EXCEPTION 'Terminal result assessment cannot retain an ISSUED question'
        USING ERRCODE='23514';
    END IF;
  ELSIF NEW."status"='CANCELLED' THEN
    IF NEW."currentQuestionIssueId" IS NOT NULL OR NEW."activeWriterLeaseId" IS NOT NULL OR NEW."writerLeaseExpiresAt" IS NOT NULL THEN
      RAISE EXCEPTION 'CANCELLED assessment cannot retain an active question/writer lease'
        USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "assessments_lifecycle_guard" ON "assessments";
CREATE TRIGGER "assessments_lifecycle_guard"
BEFORE INSERT OR UPDATE OF "status","startedAt","completedAt","pausedAt","resumeState","currentQuestionIssueId","activeWriterLeaseId","writerLeaseExpiresAt"
ON "assessments"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_assessment_lifecycle();

CREATE OR REPLACE FUNCTION mmri_guard_question_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status "AssessmentStatus";
BEGIN
  IF NEW."status"='ISSUED' THEN
    SELECT a."status" INTO v_status FROM "assessments" a WHERE a."id"=NEW."assessmentId";
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Question issue assessment does not exist' USING ERRCODE='23503';
    END IF;
    IF v_status IN ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED','CANCELLED') THEN
      RAISE EXCEPTION 'Cannot issue a question for terminal assessment %', NEW."assessmentId"
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "assessment_question_issue_lifecycle_guard" ON "assessment_asked_questions";
CREATE TRIGGER "assessment_question_issue_lifecycle_guard"
BEFORE INSERT OR UPDATE OF "status","assessmentId"
ON "assessment_asked_questions"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_question_issue_lifecycle();
