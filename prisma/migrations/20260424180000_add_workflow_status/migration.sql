-- Add REVIEW and APPROVED values to PageStatus enum
-- Using DO block for idempotency: only adds values if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REVIEW' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PageStatus')) THEN
    ALTER TYPE "PageStatus" ADD VALUE 'REVIEW';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'APPROVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PageStatus')) THEN
    ALTER TYPE "PageStatus" ADD VALUE 'APPROVED';
  END IF;
END $$;
