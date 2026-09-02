-- Add Footer + GlobalVariable tables
-- Needed by pages/api/footers.js and pages/api/global-variables.js

CREATE TABLE IF NOT EXISTS "Footer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Footer_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'GlobalVarType'
  ) THEN
    CREATE TYPE "GlobalVarType" AS ENUM ('STRING', 'NUMBER', 'URL', 'IMAGE', 'DATE', 'BOOLEAN', 'ARRAY', 'HTML');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "GlobalVariable" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "type"      "GlobalVarType" NOT NULL DEFAULT 'STRING',
  "value"     TEXT NOT NULL,
  "fallback"  TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GlobalVariable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GlobalVariable_key_key" ON "GlobalVariable"("key");
