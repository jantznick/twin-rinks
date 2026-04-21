-- Quasi-blackout preferences for sub submit warnings (Twin Rinks profile).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subWarnIfSameDayGame" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subWarnIfAdjacentGameDays" BOOLEAN NOT NULL DEFAULT false;
