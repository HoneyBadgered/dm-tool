-- Additive: separate race/class/level columns and a long-form backstory.
ALTER TABLE "PlayerCharacter" ADD COLUMN "race" TEXT,
ADD COLUMN "level" INTEGER,
ADD COLUMN "backstory" TEXT;

ALTER TABLE "Npc" ADD COLUMN "race" TEXT,
ADD COLUMN "characterClass" TEXT,
ADD COLUMN "level" INTEGER;
