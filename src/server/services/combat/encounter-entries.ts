import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  encounterEntryInputSchema,
  encounterEntryUpdateSchema,
  idSchema,
  type EncounterEntryInput,
} from "@/lib/validation/combat";
import { EncounterNotFoundError } from "@/server/services/encounters/encounters";
import { resolveCreature } from "./creature-templates";

export { EncounterNotFoundError };

export const MAX_ENTRIES_PER_ENCOUNTER = 100;

export class EncounterNotPlannedError extends Error {
  constructor(id: string) {
    super(`Encounter lineup can only be edited while planned: ${id}`);
    this.name = "EncounterNotPlannedError";
  }
}

export class EncounterEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`Encounter entry not found: ${id}`);
    this.name = "EncounterEntryNotFoundError";
  }
}

export class EncounterEntryLimitError extends Error {
  constructor() {
    super(`An encounter can have at most ${MAX_ENTRIES_PER_ENCOUNTER} entries`);
    this.name = "EncounterEntryLimitError";
  }
}

export type EntryDb = Pick<
  PrismaClient,
  | "$transaction"
  | "encounter"
  | "encounterEntry"
  | "ruleEntry"
  | "ruleSource"
  | "npc"
  | "playerCharacter"
>;

const entrySelect = {
  id: true,
  encounterId: true,
  kind: true,
  ruleEntryId: true,
  npcId: true,
  playerCharacterId: true,
  label: true,
  quantity: true,
  side: true,
  hpMode: true,
  overrides: true,
  startsHidden: true,
  wave: true,
  sortOrder: true,
} as const;

export type EncounterEntryDto = Prisma.EncounterEntryGetPayload<{
  select: typeof entrySelect;
}>;

const alive = { deletedAt: null, campaign: { deletedAt: null } } as const;

/**
 * Locks the encounter row for this transaction and proves it is still planned,
 * so a lineup edit cannot interleave with a combat start.
 */
async function lockPlannedEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
): Promise<{ campaignId: string }> {
  const touched = await tx.encounter.updateMany({
    where: { id: encounterId, status: "planned", ...alive },
    data: { updatedAt: new Date() },
  });
  if (touched.count === 0) {
    const existing = await tx.encounter.findFirst({
      where: { id: encounterId, ...alive },
      select: { id: true },
    });
    if (!existing) throw new EncounterNotFoundError(encounterId);
    throw new EncounterNotPlannedError(encounterId);
  }
  // An encounter reset to planned by hand must not be edited under a live combat.
  const openCombat = await tx.combat.count({
    where: { encounterId, status: { not: "ended" } },
  });
  if (openCombat > 0) throw new EncounterNotPlannedError(encounterId);
  const encounter = await tx.encounter.findFirstOrThrow({
    where: { id: encounterId },
    select: { campaignId: true },
  });
  return encounter;
}

export async function listEncounterEntries(
  encounterId: string,
  db: EntryDb = getDb(),
): Promise<EncounterEntryDto[]> {
  const id = idSchema.parse(encounterId);
  const encounter = await db.encounter.findFirst({
    where: { id, ...alive },
    select: { id: true },
  });
  if (!encounter) throw new EncounterNotFoundError(id);
  return db.encounterEntry.findMany({
    where: { encounterId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: entrySelect,
  });
}

export async function addEncounterEntry(
  encounterId: string,
  input: unknown,
  db: EntryDb = getDb(),
): Promise<EncounterEntryDto> {
  const id = idSchema.parse(encounterId);
  const data = encounterEntryInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    const { campaignId } = await lockPlannedEncounter(tx, id);
    // Resolving proves the reference exists, belongs to this campaign, and has usable stats.
    await resolveCreature(
      {
        kind: data.kind,
        label: data.label,
        ruleEntryId: data.ruleEntryId ?? null,
        npcId: data.npcId ?? null,
        playerCharacterId: data.playerCharacterId ?? null,
        overrides: data.overrides,
      },
      campaignId,
      tx,
    );
    const last = await tx.encounterEntry.aggregate({
      where: { encounterId: id },
      _max: { sortOrder: true },
      _count: true,
    });
    if (last._count >= MAX_ENTRIES_PER_ENCOUNTER)
      throw new EncounterEntryLimitError();
    return tx.encounterEntry.create({
      data: {
        ...toEntryData(data),
        encounterId: id,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: entrySelect,
    });
  });
}

function toEntryData(data: EncounterEntryInput) {
  return {
    kind: data.kind,
    ruleEntryId: data.ruleEntryId ?? null,
    npcId: data.npcId ?? null,
    playerCharacterId: data.playerCharacterId ?? null,
    label: data.label,
    quantity: data.quantity,
    side: data.side ?? null,
    hpMode: data.hpMode,
    overrides: data.overrides ?? Prisma.DbNull,
    startsHidden: data.startsHidden,
    wave: data.wave,
  };
}

export async function updateEncounterEntry(
  entryId: string,
  input: unknown,
  db: EntryDb = getDb(),
): Promise<EncounterEntryDto> {
  const id = idSchema.parse(entryId);
  const patch = encounterEntryUpdateSchema.parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.encounterEntry.findFirst({
      where: { id, encounter: alive },
      select: entrySelect,
    });
    if (!existing) throw new EncounterEntryNotFoundError(id);
    const { campaignId } = await lockPlannedEncounter(tx, existing.encounterId);
    // Re-validate the merged entry so cross-field rules still hold.
    const merged = encounterEntryInputSchema.parse({
      kind: existing.kind,
      ruleEntryId: existing.ruleEntryId,
      npcId: existing.npcId,
      playerCharacterId: existing.playerCharacterId,
      label: patch.label ?? existing.label,
      quantity: patch.quantity ?? existing.quantity,
      side: patch.side === undefined ? existing.side : patch.side,
      hpMode: patch.hpMode ?? existing.hpMode,
      overrides:
        patch.overrides === undefined ? existing.overrides : patch.overrides,
      startsHidden: patch.startsHidden ?? existing.startsHidden,
      wave: patch.wave ?? existing.wave,
    });
    await resolveCreature(
      {
        kind: merged.kind,
        label: merged.label,
        ruleEntryId: merged.ruleEntryId ?? null,
        npcId: merged.npcId ?? null,
        playerCharacterId: merged.playerCharacterId ?? null,
        overrides: merged.overrides,
      },
      campaignId,
      tx,
    );
    return tx.encounterEntry.update({
      where: { id },
      data: toEntryData(merged),
      select: entrySelect,
    });
  });
}

export async function removeEncounterEntry(
  entryId: string,
  db: EntryDb = getDb(),
): Promise<void> {
  const id = idSchema.parse(entryId);
  await db.$transaction(async (tx) => {
    const existing = await tx.encounterEntry.findFirst({
      where: { id, encounter: alive },
      select: { encounterId: true },
    });
    if (!existing) throw new EncounterEntryNotFoundError(id);
    await lockPlannedEncounter(tx, existing.encounterId);
    await tx.encounterEntry.delete({ where: { id } });
  });
}
