-- Create PageWorkflowEvent table for D-02: Review comments and approval history
CREATE TABLE IF NOT EXISTS "PageWorkflowEvent" (
    "id"         TEXT NOT NULL,
    "pageId"     TEXT NOT NULL,
    "fromStatus" "PageStatus" NOT NULL,
    "toStatus"   "PageStatus" NOT NULL,
    "comment"    TEXT,
    "createdBy"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- Index for fast lookup by page
CREATE INDEX IF NOT EXISTS "PageWorkflowEvent_pageId_idx" ON "PageWorkflowEvent"("pageId");

-- Foreign key: cascade on page delete
ALTER TABLE "PageWorkflowEvent"
    ADD CONSTRAINT "PageWorkflowEvent_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
