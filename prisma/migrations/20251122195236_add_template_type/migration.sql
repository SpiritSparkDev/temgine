-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('SITE', 'BLOCK');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "type" "TemplateType" NOT NULL DEFAULT 'SITE';
