-- Backend completion Step 05/20 — answer persistence / resume / correction hardening.
-- The application already treats AnswerEvent as the immutable source of truth.
-- This migration makes the critical answer-chain invariants enforceable by PostgreSQL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "answers"
    WHERE "active"=TRUE
    GROUP BY "assessmentId","questionId"
    HAVING COUNT(*)>1
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: multiple active answers for one assessment/question';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "answers" ans
    JOIN "assessments" a ON a."id"=ans."assessmentId"
    JOIN "questions" q ON q."id"=ans."questionId"
    LEFT JOIN "assessment_respondents" r ON r."id"=ans."respondentId"
    WHERE q."methodologyVersionId"<>a."methodologyVersionId"
       OR (ans."respondentId" IS NOT NULL AND (r."id" IS NULL OR r."assessmentId"<>ans."assessmentId"))
       OR ans."revision"<1
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: detached answer/question/respondent lineage';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "evidence_signals" e
    JOIN "answers" ans ON ans."id"=e."answerId"
    JOIN "diagnostic_cells" c ON c."id"=e."cellId"
    JOIN "categories" cat ON cat."id"=c."categoryId"
    JOIN "assessments" a ON a."id"=e."assessmentId"
    WHERE ans."assessmentId"<>e."assessmentId"
       OR cat."methodologyVersionId"<>a."methodologyVersionId"
       OR (e."active"=TRUE AND ans."active"=FALSE)
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: detached or stale active evidence signal';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "response_drafts" d
    JOIN "assessment_asked_questions" qi ON qi."id"=d."questionIssueId"
    WHERE qi."assessmentId"<>d."assessmentId"
       OR qi."questionId"<>d."questionId"
       OR qi."status"<>'ISSUED'
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: invalid response draft';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "answer_events"
    WHERE "clientRequestId"<>btrim("clientRequestId") OR length("clientRequestId")<1 OR length("clientRequestId")>160
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: invalid answer event clientRequestId';
  END IF;

  -- The latest immutable event defines the live answer for a question. If it is
  -- a retraction there must be no active answer; otherwise its answer must be active.
  IF EXISTS (
    WITH latest AS (
      SELECT DISTINCT ON (e."assessmentId",e."questionId")
             e."assessmentId",e."questionId",e."answerId",e."optionIndex"
      FROM "answer_events" e
      ORDER BY e."assessmentId",e."questionId",e."eventSequence" DESC
    )
    SELECT 1
    FROM latest l
    LEFT JOIN "answers" active_ans
      ON active_ans."assessmentId"=l."assessmentId"
     AND active_ans."questionId"=l."questionId"
     AND active_ans."active"=TRUE
    WHERE (l."optionIndex" IS NULL AND active_ans."id" IS NOT NULL)
       OR (l."optionIndex" IS NOT NULL AND (active_ans."id" IS NULL OR active_ans."id"<>l."answerId"))
  ) THEN
    RAISE EXCEPTION 'Answer persistence preflight failed: active answer disagrees with latest immutable event';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "answers_one_active_assessment_question_key"
  ON "answers"("assessmentId","questionId")
  WHERE "active"=TRUE;

ALTER TABLE "answer_events"
  DROP CONSTRAINT IF EXISTS "answer_events_client_request_id_format_check";
ALTER TABLE "answer_events"
  ADD CONSTRAINT "answer_events_client_request_id_format_check"
  CHECK (
    length("clientRequestId") BETWEEN 1 AND 160
    AND "clientRequestId"=btrim("clientRequestId")
  );

CREATE OR REPLACE FUNCTION mmri_guard_answer_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assessment_methodology TEXT;
  v_question_methodology TEXT;
  v_respondent_assessment TEXT;
BEGIN
  SELECT a."methodologyVersionId" INTO v_assessment_methodology
  FROM "assessments" a WHERE a."id"=NEW."assessmentId";
  SELECT q."methodologyVersionId" INTO v_question_methodology
  FROM "questions" q WHERE q."id"=NEW."questionId";

  IF v_assessment_methodology IS NULL OR v_question_methodology IS NULL
     OR v_assessment_methodology<>v_question_methodology THEN
    RAISE EXCEPTION 'Answer question must belong to the assessment methodology'
      USING ERRCODE='23514';
  END IF;

  IF NEW."respondentId" IS NOT NULL THEN
    SELECT r."assessmentId" INTO v_respondent_assessment
    FROM "assessment_respondents" r WHERE r."id"=NEW."respondentId";
    IF v_respondent_assessment IS NULL OR v_respondent_assessment<>NEW."assessmentId" THEN
      RAISE EXCEPTION 'Answer respondent must belong to the same assessment'
        USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."revision"<1 THEN
    RAISE EXCEPTION 'Answer revision must be positive' USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "answers_consistency_guard" ON "answers";
CREATE TRIGGER "answers_consistency_guard"
BEFORE INSERT OR UPDATE OF "assessmentId","questionId","respondentId","revision"
ON "answers"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_answer_consistency();

CREATE OR REPLACE FUNCTION mmri_guard_evidence_signal_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_answer_assessment TEXT;
  v_answer_active BOOLEAN;
  v_assessment_methodology TEXT;
  v_cell_methodology TEXT;
BEGIN
  SELECT ans."assessmentId",ans."active"
    INTO v_answer_assessment,v_answer_active
  FROM "answers" ans WHERE ans."id"=NEW."answerId";

  IF v_answer_assessment IS NULL OR v_answer_assessment<>NEW."assessmentId" THEN
    RAISE EXCEPTION 'Evidence signal answer must belong to the same assessment'
      USING ERRCODE='23514';
  END IF;

  IF NEW."active"=TRUE AND v_answer_active=FALSE THEN
    RAISE EXCEPTION 'Inactive answer cannot retain active evidence'
      USING ERRCODE='23514';
  END IF;

  SELECT a."methodologyVersionId" INTO v_assessment_methodology
  FROM "assessments" a WHERE a."id"=NEW."assessmentId";
  SELECT c."methodologyVersionId" INTO v_cell_methodology
  FROM "diagnostic_cells" c WHERE c."id"=NEW."cellId";

  IF v_assessment_methodology IS NULL OR v_cell_methodology IS NULL
     OR v_assessment_methodology<>v_cell_methodology THEN
    RAISE EXCEPTION 'Evidence signal cell must belong to the assessment methodology'
      USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "evidence_signals_consistency_guard" ON "evidence_signals";
CREATE TRIGGER "evidence_signals_consistency_guard"
BEFORE INSERT OR UPDATE OF "assessmentId","answerId","cellId","active"
ON "evidence_signals"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_evidence_signal_consistency();

CREATE OR REPLACE FUNCTION mmri_guard_response_draft_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_issue_assessment TEXT;
  v_issue_question TEXT;
  v_issue_status "QuestionIssueStatus";
BEGIN
  SELECT qi."assessmentId",qi."questionId",qi."status"
    INTO v_issue_assessment,v_issue_question,v_issue_status
  FROM "assessment_asked_questions" qi WHERE qi."id"=NEW."questionIssueId";

  IF v_issue_assessment IS NULL
     OR v_issue_assessment<>NEW."assessmentId"
     OR v_issue_question<>NEW."questionId"
     OR v_issue_status<>'ISSUED' THEN
    RAISE EXCEPTION 'Response draft must belong to the matching ISSUED question'
      USING ERRCODE='23514';
  END IF;

  IF NEW."draftRevision"<1 THEN
    RAISE EXCEPTION 'Draft revision must be positive' USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "response_drafts_consistency_guard" ON "response_drafts";
CREATE TRIGGER "response_drafts_consistency_guard"
BEFORE INSERT OR UPDATE OF "assessmentId","questionIssueId","questionId","draftRevision"
ON "response_drafts"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_response_draft_consistency();

CREATE OR REPLACE FUNCTION mmri_guard_answer_event_append()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_issue_assessment TEXT;
  v_issue_question TEXT;
  v_answer_assessment TEXT;
  v_answer_question TEXT;
  v_respondent_assessment TEXT;
BEGIN
  SELECT qi."assessmentId",qi."questionId"
    INTO v_issue_assessment,v_issue_question
  FROM "assessment_asked_questions" qi WHERE qi."id"=NEW."questionIssueId";
  SELECT ans."assessmentId",ans."questionId"
    INTO v_answer_assessment,v_answer_question
  FROM "answers" ans WHERE ans."id"=NEW."answerId";

  IF v_issue_assessment IS NULL OR v_answer_assessment IS NULL
     OR v_issue_assessment<>NEW."assessmentId"
     OR v_answer_assessment<>NEW."assessmentId"
     OR v_issue_question<>NEW."questionId"
     OR v_answer_question<>NEW."questionId" THEN
    RAISE EXCEPTION 'AnswerEvent lineage does not match assessment/question'
      USING ERRCODE='23514';
  END IF;

  IF NEW."respondentId" IS NOT NULL THEN
    SELECT r."assessmentId" INTO v_respondent_assessment
    FROM "assessment_respondents" r WHERE r."id"=NEW."respondentId";
    IF v_respondent_assessment IS NULL OR v_respondent_assessment<>NEW."assessmentId" THEN
      RAISE EXCEPTION 'AnswerEvent respondent must belong to the same assessment'
        USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."eventSequence"<1 THEN
    RAISE EXCEPTION 'AnswerEvent sequence must be positive' USING ERRCODE='23514';
  END IF;

  IF NEW."optionIndex" IS NULL AND NEW."answerState"<>'RETRACTED' THEN
    RAISE EXCEPTION 'Only RETRACTED AnswerEvents may omit optionIndex'
      USING ERRCODE='23514';
  END IF;
  IF NEW."optionIndex" IS NOT NULL AND NEW."answerState"='RETRACTED' THEN
    RAISE EXCEPTION 'RETRACTED AnswerEvent cannot contain optionIndex'
      USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "answer_events_append_guard" ON "answer_events";
CREATE TRIGGER "answer_events_append_guard"
BEFORE INSERT
ON "answer_events"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_answer_event_append();

CREATE OR REPLACE FUNCTION mmri_guard_answer_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AnswerEvents are append-only and cannot be updated'
    USING ERRCODE='23514';
END;
$$;

DROP TRIGGER IF EXISTS "answer_events_immutable_guard" ON "answer_events";
CREATE TRIGGER "answer_events_immutable_guard"
BEFORE UPDATE
ON "answer_events"
FOR EACH ROW
EXECUTE FUNCTION mmri_guard_answer_event_immutable();
