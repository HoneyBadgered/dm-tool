-- Combat tracker data model. Additive only: new enums/tables, one defaulted column on "PlayerCharacter".
-- No existing rows are modified, dropped, or rewritten.

-- CreateEnum
CREATE TYPE "CreatureKind" AS ENUM ('monster', 'npc', 'player_character', 'custom');

-- CreateEnum
CREATE TYPE "HpMode" AS ENUM ('average', 'rolled', 'manual');

-- CreateEnum
CREATE TYPE "CombatSide" AS ENUM ('party', 'enemy', 'neutral');

-- CreateEnum
CREATE TYPE "CombatStatus" AS ENUM ('setup', 'running', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "CombatantStatus" AS ENUM ('active', 'defeated', 'removed');

-- CreateEnum
CREATE TYPE "EffectKind" AS ENUM ('condition', 'ongoing');

-- CreateEnum
CREATE TYPE "EffectExpiryTrigger" AS ENUM ('none', 'start_of_target_turn', 'end_of_target_turn', 'start_of_source_turn', 'end_of_source_turn');

-- CreateEnum
CREATE TYPE "CombatEventType" AS ENUM ('combat_created', 'combat_status_changed', 'combat_ended', 'initiative_set', 'turn_changed', 'damage', 'heal', 'temp_hp_set', 'max_hp_set', 'effect_added', 'effect_removed', 'combatant_added', 'combatant_removed', 'combatant_restored', 'visibility_changed', 'combatant_updated', 'note', 'undo');

-- AlterTable
ALTER TABLE "PlayerCharacter" ADD COLUMN     "initiativeModifier" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EncounterEntry" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "kind" "CreatureKind" NOT NULL,
    "ruleEntryId" TEXT,
    "npcId" TEXT,
    "playerCharacterId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "side" "CombatSide",
    "hpMode" "HpMode" NOT NULL DEFAULT 'average',
    "overrides" JSONB,
    "startsHidden" BOOLEAN NOT NULL DEFAULT false,
    "wave" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "encounterId" TEXT,
    "name" TEXT,
    "status" "CombatStatus" NOT NULL DEFAULT 'setup',
    "round" INTEGER NOT NULL DEFAULT 1,
    "activeCombatantId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "eventSeq" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combatant" (
    "id" TEXT NOT NULL,
    "combatId" TEXT NOT NULL,
    "kind" "CreatureKind" NOT NULL,
    "name" TEXT NOT NULL,
    "side" "CombatSide" NOT NULL,
    "status" "CombatantStatus" NOT NULL DEFAULT 'active',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "wave" INTEGER NOT NULL DEFAULT 0,
    "initiative" INTEGER,
    "initiativeTieBreak" INTEGER NOT NULL DEFAULT 0,
    "maxHp" INTEGER NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "tempHp" INTEGER NOT NULL DEFAULT 0,
    "armorClass" INTEGER NOT NULL,
    "sourceRuleEntryId" TEXT,
    "sourceContentHash" TEXT,
    "sourceNpcId" TEXT,
    "sourcePlayerCharacterId" TEXT,
    "statSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "bossPhases" JSONB,
    "currentPhase" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combatant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatEffect" (
    "id" TEXT NOT NULL,
    "combatId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceCombatantId" TEXT,
    "kind" "EffectKind" NOT NULL,
    "name" TEXT NOT NULL,
    "conditionIndex" TEXT,
    "note" TEXT,
    "concentration" BOOLEAN NOT NULL DEFAULT false,
    "startedRound" INTEGER NOT NULL,
    "expiresAtRound" INTEGER,
    "expiryTrigger" "EffectExpiryTrigger" NOT NULL DEFAULT 'none',
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombatEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatEvent" (
    "id" TEXT NOT NULL,
    "combatId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "CombatEventType" NOT NULL,
    "round" INTEGER NOT NULL,
    "actorCombatantId" TEXT,
    "targetCombatantId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "undoneBySeq" INTEGER,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncounterEntry_encounterId_sortOrder_idx" ON "EncounterEntry"("encounterId", "sortOrder");

-- CreateIndex
CREATE INDEX "Combat_campaignId_status_idx" ON "Combat"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Combat_encounterId_idx" ON "Combat"("encounterId");

-- CreateIndex
CREATE INDEX "Combatant_combatId_status_idx" ON "Combatant"("combatId", "status");

-- CreateIndex
CREATE INDEX "CombatEffect_combatId_isActive_idx" ON "CombatEffect"("combatId", "isActive");

-- CreateIndex
CREATE INDEX "CombatEffect_targetId_isActive_idx" ON "CombatEffect"("targetId", "isActive");

-- CreateIndex
CREATE INDEX "CombatEvent_combatId_createdAt_idx" ON "CombatEvent"("combatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CombatEvent_combatId_seq_key" ON "CombatEvent"("combatId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "CombatEvent_combatId_idempotencyKey_key" ON "CombatEvent"("combatId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "EncounterEntry" ADD CONSTRAINT "EncounterEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterEntry" ADD CONSTRAINT "EncounterEntry_ruleEntryId_fkey" FOREIGN KEY ("ruleEntryId") REFERENCES "RuleEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterEntry" ADD CONSTRAINT "EncounterEntry_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterEntry" ADD CONSTRAINT "EncounterEntry_playerCharacterId_fkey" FOREIGN KEY ("playerCharacterId") REFERENCES "PlayerCharacter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combat" ADD CONSTRAINT "Combat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combat" ADD CONSTRAINT "Combat_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_sourceRuleEntryId_fkey" FOREIGN KEY ("sourceRuleEntryId") REFERENCES "RuleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_sourceNpcId_fkey" FOREIGN KEY ("sourceNpcId") REFERENCES "Npc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combatant" ADD CONSTRAINT "Combatant_sourcePlayerCharacterId_fkey" FOREIGN KEY ("sourcePlayerCharacterId") REFERENCES "PlayerCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatEffect" ADD CONSTRAINT "CombatEffect_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatEffect" ADD CONSTRAINT "CombatEffect_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Combatant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatEffect" ADD CONSTRAINT "CombatEffect_sourceCombatantId_fkey" FOREIGN KEY ("sourceCombatantId") REFERENCES "Combatant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatEvent" ADD CONSTRAINT "CombatEvent_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "Combat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity constraints Prisma cannot express (hand-written, additive).

-- At most one unfinished combat per encounter.
CREATE UNIQUE INDEX "Combat_one_open_per_encounter"
  ON "Combat"("encounterId")
  WHERE "encounterId" IS NOT NULL AND "status" <> 'ended';

-- The same library condition from the same source cannot be active twice on one target.
CREATE UNIQUE INDEX "CombatEffect_one_active_condition"
  ON "CombatEffect"("targetId", "conditionIndex", COALESCE("sourceCombatantId", ''))
  WHERE "isActive" AND "conditionIndex" IS NOT NULL;

ALTER TABLE "EncounterEntry"
  ADD CONSTRAINT "EncounterEntry_quantity_check" CHECK ("quantity" BETWEEN 1 AND 50),
  ADD CONSTRAINT "EncounterEntry_wave_check" CHECK ("wave" >= 0),
  ADD CONSTRAINT "EncounterEntry_kind_reference_check" CHECK (
    ("kind" <> 'monster' OR "ruleEntryId" IS NOT NULL)
    AND ("kind" <> 'npc' OR "npcId" IS NOT NULL)
    AND ("kind" <> 'player_character' OR ("playerCharacterId" IS NOT NULL AND "quantity" = 1))
  );

ALTER TABLE "Combat"
  ADD CONSTRAINT "Combat_round_check" CHECK ("round" >= 1),
  ADD CONSTRAINT "Combat_counters_check" CHECK ("version" >= 0 AND "eventSeq" >= 0);

ALTER TABLE "Combatant"
  ADD CONSTRAINT "Combatant_hp_check" CHECK (
    "maxHp" BETWEEN 1 AND 999999
    AND "currentHp" BETWEEN 0 AND "maxHp"
    AND "tempHp" BETWEEN 0 AND 999999
  ),
  ADD CONSTRAINT "Combatant_armor_class_check" CHECK ("armorClass" BETWEEN 0 AND 99),
  ADD CONSTRAINT "Combatant_phase_check" CHECK ("currentPhase" >= 0);

ALTER TABLE "CombatEffect"
  ADD CONSTRAINT "CombatEffect_expiry_check" CHECK (
    ("expiryTrigger" = 'none') = ("expiresAtRound" IS NULL)
  );

ALTER TABLE "CombatEvent"
  ADD CONSTRAINT "CombatEvent_seq_check" CHECK ("seq" >= 1);
