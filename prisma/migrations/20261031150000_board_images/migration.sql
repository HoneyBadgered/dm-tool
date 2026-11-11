ALTER TYPE "BoardNodeKind" ADD VALUE 'image';

CREATE TABLE "BoardImage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardImage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BoardNode" ADD COLUMN "imageId" TEXT;

CREATE INDEX "BoardImage_campaignId_idx" ON "BoardImage"("campaignId");
CREATE INDEX "BoardNode_imageId_idx" ON "BoardNode"("imageId");

ALTER TABLE "BoardImage" ADD CONSTRAINT "BoardImage_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_imageId_fkey"
    FOREIGN KEY ("imageId") REFERENCES "BoardImage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
