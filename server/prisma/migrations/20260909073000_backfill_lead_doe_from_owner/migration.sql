UPDATE "Lead"
SET "doe" = "owner"
WHERE "doe" IS NULL
  AND "owner" IS NOT NULL;
