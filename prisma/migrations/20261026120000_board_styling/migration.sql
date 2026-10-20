-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BoardNodeKind" ADD VALUE 'text';
ALTER TYPE "BoardNodeKind" ADD VALUE 'sticky';
ALTER TYPE "BoardNodeKind" ADD VALUE 'shape';
ALTER TYPE "BoardNodeKind" ADD VALUE 'frame';

-- AlterTable
ALTER TABLE "BoardEdge" ADD COLUMN     "style" JSONB;

-- AlterTable
ALTER TABLE "BoardNode" ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "style" JSONB,
ADD COLUMN     "width" DOUBLE PRECISION,
ADD COLUMN     "zIndex" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "BoardNode" ADD CONSTRAINT "BoardNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BoardNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

