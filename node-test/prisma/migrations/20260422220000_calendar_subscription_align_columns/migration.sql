-- Repair partial "CalendarSubscription" rows (missing columns vs prisma/schema.prisma).
-- Safe on clean DBs: ADD COLUMN IF NOT EXISTS is a no-op when the column already exists
-- (e.g. after 20260421180000_calendar_blocklist).

ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "mode" TEXT;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "leagueScopes" JSONB;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "syncStatus" TEXT;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT;
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);
ALTER TABLE "CalendarSubscription" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "CalendarSubscription" SET "url" = '' WHERE "url" IS NULL;
UPDATE "CalendarSubscription" SET "mode" = 'IMPORT_ALL' WHERE "mode" IS NULL;
UPDATE "CalendarSubscription" SET "leagueScopes" = '[]'::jsonb WHERE "leagueScopes" IS NULL;
UPDATE "CalendarSubscription" SET "syncStatus" = 'idle' WHERE "syncStatus" IS NULL;
UPDATE "CalendarSubscription" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
UPDATE "CalendarSubscription" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

ALTER TABLE "CalendarSubscription" ALTER COLUMN "url" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "leagueScopes" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "leagueScopes" SET DEFAULT '[]'::jsonb;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "syncStatus" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "syncStatus" SET DEFAULT 'idle';
ALTER TABLE "CalendarSubscription" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "CalendarSubscription" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
