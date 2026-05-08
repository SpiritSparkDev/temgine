-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED');

-- AlterTable
ALTER TABLE "FileMetadata" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "accessGroups" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "blogType" TEXT;

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyTokenExp" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "MemberGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberGroupMembership" (
    "memberId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "MemberGroupMembership_pkey" PRIMARY KEY ("memberId","groupId")
);

-- CreateTable
CREATE TABLE "BlogChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "templateDetailPreview" TEXT,
    "templateSimplePreview" TEXT,
    "templateArchiveEntry" TEXT,
    "templateReading" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "coverImage" TEXT,
    "author" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "templateData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Member_verifyToken_key" ON "Member"("verifyToken");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MemberGroup_slug_key" ON "MemberGroup"("slug");

-- CreateIndex
CREATE INDEX "MemberGroup_slug_idx" ON "MemberGroup"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogChannel_slug_key" ON "BlogChannel"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_channelId_status_idx" ON "BlogPost"("channelId", "status");

-- CreateIndex
CREATE INDEX "BlogPost_channelId_publishedAt_idx" ON "BlogPost"("channelId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_channelId_slug_key" ON "BlogPost"("channelId", "slug");

-- AddForeignKey
ALTER TABLE "MemberGroupMembership" ADD CONSTRAINT "MemberGroupMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberGroupMembership" ADD CONSTRAINT "MemberGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MemberGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "BlogChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
