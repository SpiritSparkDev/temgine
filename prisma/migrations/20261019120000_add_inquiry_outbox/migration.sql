-- CreateTable
CREATE TABLE "InquiryOutbox" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "InquiryOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InquiryOutbox_externalId_key" ON "InquiryOutbox"("externalId");

-- CreateIndex
CREATE INDEX "InquiryOutbox_status_nextAttemptAt_idx" ON "InquiryOutbox"("status", "nextAttemptAt");
