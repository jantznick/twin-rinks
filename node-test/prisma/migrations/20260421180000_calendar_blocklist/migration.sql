-- CreateTable
CREATE TABLE "CalendarSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "mode" TEXT NOT NULL,
    "leagueScopes" JSONB NOT NULL DEFAULT '[]',
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBlocklistEntry" (
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

-- CreateIndex
CREATE INDEX "CalendarSubscription_userId_idx" ON "CalendarSubscription"("userId");

-- CreateIndex
CREATE INDEX "CalendarBlocklistEntry_subscriptionId_idx" ON "CalendarBlocklistEntry"("subscriptionId");

-- CreateIndex
CREATE INDEX "CalendarBlocklistEntry_dateKeyChicago_idx" ON "CalendarBlocklistEntry"("dateKeyChicago");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "CalendarBlocklistEntry_subscriptionId_icsUid_recurrenceId_instanceStartUtc_key" ON "CalendarBlocklistEntry"("subscriptionId", "icsUid", "recurrenceId", "instanceStartUtc");

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlocklistEntry" ADD CONSTRAINT "CalendarBlocklistEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CalendarSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
