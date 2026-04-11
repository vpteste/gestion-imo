-- AlterTable Lease
ALTER TABLE "Lease" ADD COLUMN "reference" TEXT;

-- Backfill existing leases with a readable business reference
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS seq
    FROM "Lease"
)
UPDATE "Lease" AS lease
SET "reference" = CONCAT('BAIL-', TO_CHAR(CURRENT_DATE, 'YYYYMM'), '-', LPAD(ranked.seq::text, 6, '0'))
FROM ranked
WHERE lease."id" = ranked."id"
  AND lease."reference" IS NULL;

-- Enforce required + unique business reference
ALTER TABLE "Lease" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "Lease_reference_key" ON "Lease"("reference");