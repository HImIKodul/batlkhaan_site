-- R2: allow immutable answer correction/retraction events for the same question.
DROP INDEX IF EXISTS "answer_events_assessmentId_questionId_key";
CREATE INDEX IF NOT EXISTS "answer_events_assessmentId_questionId_eventSequence_idx"
  ON "answer_events"("assessmentId","questionId","eventSequence");
