-- Create FileMetadata table for E-02: media metadata (alt-text, copyright, caption)
CREATE TABLE IF NOT EXISTS "FileMetadata" (
    "id"        TEXT NOT NULL,
    "url"       TEXT NOT NULL,
    "altText"   TEXT,
    "copyright" TEXT,
    "caption"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FileMetadata_url_key" ON "FileMetadata"("url");
CREATE INDEX IF NOT EXISTS "FileMetadata_url_idx" ON "FileMetadata"("url");
