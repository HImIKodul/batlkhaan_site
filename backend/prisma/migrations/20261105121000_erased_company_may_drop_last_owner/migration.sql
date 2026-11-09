-- Erasing a company (data erasure at the owner's request) removes its memberships, including the last OWNER.
-- The last-owner guard keeps protecting every live company; it now lets an ERASED company (companies."erasedAt" set in the same
-- transaction) drop its memberships. Function replacement only: no data is changed.

CREATE OR REPLACE FUNCTION mmri_guard_last_company_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id TEXT;
BEGIN
  v_company_id := OLD."companyId";

  PERFORM pg_advisory_xact_lock(hashtext(v_company_id));

  -- Cascading company deletion must not be blocked by this ownership guard.
  IF NOT EXISTS (SELECT 1 FROM "companies" WHERE "id" = v_company_id) THEN
    RETURN NULL;
  END IF;

  -- A company whose customer content was erased no longer needs an owner.
  IF EXISTS (SELECT 1 FROM "companies" WHERE "id" = v_company_id AND "erasedAt" IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "company_memberships"
    WHERE "companyId" = v_company_id
      AND "role" = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'A company must retain at least one OWNER'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;
