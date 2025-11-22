-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "data" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "template" TEXT;
