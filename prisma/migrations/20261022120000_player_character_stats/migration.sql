-- Additive: optional stats and notes for player characters.
ALTER TABLE "PlayerCharacter" ADD COLUMN "characterClass" TEXT,
ADD COLUMN "speed" TEXT,
ADD COLUMN "passivePerception" INTEGER,
ADD COLUMN "abilityScores" JSONB,
ADD COLUMN "notes" TEXT;
