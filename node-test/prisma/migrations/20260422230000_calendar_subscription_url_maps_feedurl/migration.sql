-- End state: calendar feed URL is always the column "url" (matches Prisma with no @map).
-- - Fresh installs (only "url" from 20260421180000): no-op.
-- - Legacy DBs with only "feedUrl": rename to "url".
-- - Broken DBs with both: copy into "url", drop "feedUrl".

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription' AND column_name = 'feedUrl'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription' AND column_name = 'url'
  ) THEN
    UPDATE "CalendarSubscription"
    SET "url" = COALESCE(NULLIF(TRIM("url"), ''), "feedUrl")
    WHERE TRUE;
    ALTER TABLE "CalendarSubscription" DROP COLUMN "feedUrl";
    ALTER TABLE "CalendarSubscription" ALTER COLUMN "url" SET NOT NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription' AND column_name = 'feedUrl'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription' AND column_name = 'url'
  ) THEN
    ALTER TABLE "CalendarSubscription" RENAME COLUMN "feedUrl" TO "url";
  END IF;
END $$;
