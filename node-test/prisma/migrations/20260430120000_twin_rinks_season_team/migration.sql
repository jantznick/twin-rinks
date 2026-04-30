-- Season calendar team selection (dashboard merge from seasonCalendar.json)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksSeasonLeague" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksSeasonTeam" TEXT;
