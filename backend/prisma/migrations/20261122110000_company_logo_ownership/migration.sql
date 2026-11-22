-- SEC-03: a company can only ever point at a logo asset that belongs to the same company (database-level invariant, independent of application code).
-- A trigger is used (not a composite foreign key) so the Prisma model stays unchanged.
CREATE OR REPLACE FUNCTION company_logo_ownership_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."logoAssetId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "company_logo_assets" a WHERE a."id" = NEW."logoAssetId" AND a."companyId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'company logo asset % does not belong to company %', NEW."logoAssetId", NEW."id" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "companies_logo_ownership_guard" BEFORE INSERT OR UPDATE OF "logoAssetId" ON "companies"
  FOR EACH ROW EXECUTE FUNCTION company_logo_ownership_guard();
-- An asset can never be moved to another company (report snapshots reference assets by id).
CREATE OR REPLACE FUNCTION company_logo_asset_immutable_owner() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" THEN
    RAISE EXCEPTION 'company logo asset owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "company_logo_assets_owner_immutable" BEFORE UPDATE OF "companyId" ON "company_logo_assets"
  FOR EACH ROW EXECUTE FUNCTION company_logo_asset_immutable_owner();
