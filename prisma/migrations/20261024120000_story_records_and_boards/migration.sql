-- CreateEnum
CREATE TYPE "StoryRecordKind" AS ENUM ('faction', 'location', 'quest', 'clue', 'event');

-- CreateEnum
CREATE TYPE "BoardNodeKind" AS ENUM ('record', 'note');

-- CreateEnum
CREATE TYPE "BoardNodeStatus" AS ENUM ('confirmed', 'possible', 'retired');

-- CreateEnum
CREATE TYPE "BoardEdgeType" AS ENUM ('ally', 'enemy', 'serves', 'knows_secret', 'reveals_clue', 'causes_event');

-- CreateTable
CREATE TABLE "StoryRecord" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "StoryRecordKind" NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "dmNotes" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "viewport" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryArc" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2f5d3a',

    CONSTRAINT "StoryArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardNode" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "kind" "BoardNodeKind" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BoardNodeStatus" NOT NULL DEFAULT 'confirmed',
    "title" TEXT,
    "text" TEXT,
    "dmNote" TEXT,
    "arcId" TEXT,
    "npcId" TEXT,
    "playerCharacterId" TEXT,
    "sessionId" TEXT,
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardEdge" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "BoardEdgeType" NOT NULL,
    "label" TEXT,

    CONSTRAINT "BoardEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryRecord_campaignId_kind_idx" ON "StoryRecord"("campaignId", "kind");

-- CreateIndex
CREATE INDEX "Board_campaignId_idx" ON "Board"("campaignId");

-- CreateIndex
CREATE INDEX "StoryArc_boardId_idx" ON "StoryArc"("boardId");

-- CreateIndex
CREATE INDEX "BoardNode_boardId_idx" ON "BoardNode"("boardId");

-- CreateIndex
CREATE INDEX "BoardEdge_boardId_idx" ON "BoardEdge"("boardId");

-- AddForeignKey
ALTER TABLE "StoryRecord" ADD CONSTRAINT "StoryRecord_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryArc" ADD CONSTRAINT "StoryArc_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_arcId_fkey" FOREIGN KEY ("arcId") REFERENCES "StoryArc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_playerCharacterId_fkey" FOREIGN KEY ("playerCharacterId") REFERENCES "PlayerCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "StoryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardEdge" ADD CONSTRAINT "BoardEdge_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardEdge" ADD CONSTRAINT "BoardEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "BoardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardEdge" ADD CONSTRAINT "BoardEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BoardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

