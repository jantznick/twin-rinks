-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksPasswordEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksPhpsessid" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksSessionUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twinRinksLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR(255) NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_expire_idx" ON "session"("expire");

-- CreateTable
CREATE TABLE IF NOT EXISTS "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "tokenType" VARCHAR(32) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_token_key" ON "auth_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auth_tokens_userId_idx" ON "auth_tokens"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auth_tokens_token_idx" ON "auth_tokens"("token");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_tokens_userId_fkey'
  ) THEN
    ALTER TABLE "auth_tokens"
      ADD CONSTRAINT "auth_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
