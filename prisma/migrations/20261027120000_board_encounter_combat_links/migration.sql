-- AlterTable
ALTER TABLE "BoardNode" ADD COLUMN     "combatId" TEXT,
ADD COLUMN     "encounterId" TEXT;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
