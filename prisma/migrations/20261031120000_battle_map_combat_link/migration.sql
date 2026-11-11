-- AlterTable
ALTER TABLE "BattleMap" ADD COLUMN "combatId" TEXT;

-- CreateIndex
CREATE INDEX "BattleMap_combatId_idx" ON "BattleMap"("combatId");

-- AddForeignKey
ALTER TABLE "BattleMap" ADD CONSTRAINT "BattleMap_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
