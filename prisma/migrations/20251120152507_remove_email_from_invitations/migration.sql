/*
  Warnings:

  - You are about to drop the column `email` on the `UserInvitation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserInvitation" DROP COLUMN "email",
ADD COLUMN     "usedBy" TEXT;
