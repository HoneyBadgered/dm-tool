ALTER TABLE "Npc"
  ADD COLUMN "titleAlias" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "challengeRating" TEXT,
  ADD COLUMN "locationRecordId" TEXT,
  ADD COLUMN "faction" TEXT,
  ADD COLUMN "factionRecordId" TEXT,
  ADD COLUMN "quickSummary" TEXT,
  ADD COLUMN "appearance" TEXT,
  ADD COLUMN "personality" TEXT,
  ADD COLUMN "motivation" TEXT,
  ADD COLUMN "goals" TEXT,
  ADD COLUMN "currentPlans" TEXT,
  ADD COLUMN "fearWeakness" TEXT,
  ADD COLUMN "secret" TEXT,
  ADD COLUMN "knowledgeClues" TEXT,
  ADD COLUMN "voiceMannerisms" TEXT,
  ADD COLUMN "partyRelationship" TEXT,
  ADD COLUMN "initiativeCombatNotes" TEXT,
  ADD COLUMN "dmNotes" TEXT,
  ADD COLUMN "relationshipNotes" TEXT,
  ADD COLUMN "statBlockReference" TEXT,
  ADD COLUMN "firstAppearance" TEXT,
  ADD COLUMN "lastSeen" TEXT,
  ADD COLUMN "portraitUrl" TEXT;

CREATE INDEX "Npc_locationRecordId_idx" ON "Npc"("locationRecordId");
CREATE INDEX "Npc_factionRecordId_idx" ON "Npc"("factionRecordId");

ALTER TABLE "Npc"
  ADD CONSTRAINT "Npc_locationRecordId_fkey"
    FOREIGN KEY ("locationRecordId") REFERENCES "StoryRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Npc_factionRecordId_fkey"
    FOREIGN KEY ("factionRecordId") REFERENCES "StoryRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
