-- CreateTable
CREATE TABLE "BattleMap" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cols" INTEGER NOT NULL DEFAULT 30,
    "rows" INTEGER NOT NULL DEFAULT 20,
    "cellSize" INTEGER NOT NULL DEFAULT 50,
    "feetPerCell" INTEGER NOT NULL DEFAULT 5,
    "bgMime" TEXT,
    "bgData" BYTEA,
    "bgWidth" INTEGER,
    "bgHeight" INTEGER,
    "bgRev" INTEGER NOT NULL DEFAULT 0,
    "bgScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "bgX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bgY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BattleMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleMap_campaignId_idx" ON "BattleMap"("campaignId");

-- AddForeignKey
ALTER TABLE "BattleMap" ADD CONSTRAINT "BattleMap_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
