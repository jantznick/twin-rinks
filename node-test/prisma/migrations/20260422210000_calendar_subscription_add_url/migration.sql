-- CalendarSubscription sometimes exists without "url" (e.g. partial / manual migration).
-- Prisma expects column "url" TEXT NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'CalendarSubscription'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CalendarSubscription'
      AND column_name = 'url'
  ) THEN
    ALTER TABLE "CalendarSubscription" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';
    ALTER TABLE "CalendarSubscription" ALTER COLUMN "url" DROP DEFAULT;
  END IF;
END $$;
