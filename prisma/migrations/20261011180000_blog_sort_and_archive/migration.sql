-- AlterTable
ALTER TABLE "BlogChannel" ADD COLUMN     "sortField" TEXT,
ADD COLUMN     "sortDir" TEXT;

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;
