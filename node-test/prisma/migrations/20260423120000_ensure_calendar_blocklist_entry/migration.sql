-- Repair: some environments have CalendarSubscription (from later migrations / db push)
-- but never got CalendarBlocklistEntry (skipped or failed 20260421180000). Prisma then
-- throws P2021 on any blocklist query. This migration is idempotent and safe on clean DBs.

CREATE TABLE IF NOT EXISTS "CalendarBlocklistEntry" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "icsUid" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL DEFAULT '',
    "instanceStartUtc" TIMESTAMP(3) NOT NULL,
    "dateKeyChicago" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "CalendarBlocklistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CalendarBlocklistEntry_subscriptionId_idx" ON "CalendarBlocklistEntry"("subscriptionId");

CREATE INDEX IF NOT EXISTS "CalendarBlocklistEntry_dateKeyChicago_idx" ON "CalendarBlocklistEntry"("dateKeyChicago");

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarBlocklistEntry_subscriptionId_icsUid_recurrenceId_instanceStartUtc_key" ON "CalendarBlocklistEntry"("subscriptionId", "icsUid", "recurrenceId", "instanceStartUtc");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CalendarSubscription'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CalendarBlocklistEntry_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "CalendarBlocklistEntry" ADD CONSTRAINT "CalendarBlocklistEntry_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "CalendarSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
