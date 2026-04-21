-- CreateTable
CREATE TABLE "BlackoutRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recurrenceKind" TEXT NOT NULL,
    "oneOffDate" DATE,
    "weekday" INTEGER,
    "monthOrdinal" INTEGER,
    "leagueScopes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackoutRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlackoutRule_userId_idx" ON "BlackoutRule"("userId");

-- AddForeignKey
ALTER TABLE "BlackoutRule" ADD CONSTRAINT "BlackoutRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove JSON column if it was added in a branch without migration
ALTER TABLE "User" DROP COLUMN IF EXISTS "blackoutRules";
