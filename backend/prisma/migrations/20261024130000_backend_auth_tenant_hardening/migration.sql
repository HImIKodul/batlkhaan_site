-- Backend completion Step 03/20 — authentication / tenant / ownership hardening.
-- Protect the invariant that an existing company cannot lose its final OWNER,
-- including concurrent demotion/deletion transactions.

CREATE OR REPLACE FUNCTION mmri_guard_last_company_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id TEXT;
BEGIN
  v_company_id := OLD."companyId";

  -- Serialize OWNER-removal checks for the same company. This closes the
  -- concurrent write-skew case where two owners could otherwise demote each
  -- other after both observed ownerCount = 2.
  PERFORM pg_advisory_xact_lock(hashtext(v_company_id));

  -- Cascading company deletion must not be blocked by this ownership guard.
  IF NOT EXISTS (SELECT 1 FROM "companies" WHERE "id" = v_company_id) THEN
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

DROP TRIGGER IF EXISTS "company_memberships_last_owner_guard" ON "company_memberships";
CREATE CONSTRAINT TRIGGER "company_memberships_last_owner_guard"
AFTER DELETE OR UPDATE
ON "company_memberships"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
WHEN (OLD."role" = 'OWNER')
EXECUTE FUNCTION mmri_guard_last_company_owner();

-- Helpful for role/ownership authorization queries and owner-count checks.
CREATE INDEX IF NOT EXISTS "company_memberships_company_role_user_idx"
  ON "company_memberships"("companyId", "role", "userId");
