-- CreateTable
CREATE TABLE "Npc" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Npc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Npc_campaignId_idx" ON "Npc"("campaignId");

-- AddForeignKey
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
