-- Add missing navigation enum + table
-- Needed by pages/api/navigations.js

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'NavType'
  ) THEN
    CREATE TYPE "NavType" AS ENUM ('MAIN', 'PAGE', 'MOBILE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Navigation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "NavType" NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Navigation_pkey" PRIMARY KEY ("id")
);
