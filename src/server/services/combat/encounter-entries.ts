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
const ENTRY_LABEL_MAX = 80;

export class DuplicatePlayerEntryError extends Error {
  constructor() {
    super("That player character is already in this encounter");
    this.name = "DuplicatePlayerEntryError";
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
 * Touches the encounter row: this serialises lineup edits against each other and
 * against a combat launch (which holds the same row lock), and bumps updatedAt.
 * Live combats hold frozen snapshots, so editing a template never changes them.
 */
async function lockEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
): Promise<{ campaignId: string }> {
  const touched = await tx.encounter.updateMany({
    where: { id: encounterId, ...alive },
    data: { updatedAt: new Date() },
  });
  if (touched.count === 0) throw new EncounterNotFoundError(encounterId);
  return tx.encounter.findFirstOrThrow({
    where: { id: encounterId },
    select: { campaignId: true },
  });
}

async function assertPlayerNotPresent(
  tx: Prisma.TransactionClient,
  encounterId: string,
  playerCharacterId: string | null | undefined,
  exceptEntryId?: string,
): Promise<void> {
  if (!playerCharacterId) return;
  const existing = await tx.encounterEntry.findFirst({
    where: {
      encounterId,
      playerCharacterId,
      ...(exceptEntryId ? { id: { not: exceptEntryId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new DuplicatePlayerEntryError();
}

/** Rewrites sortOrder as 0..n-1 following the given id order. */
async function writeOrder(
  tx: Prisma.TransactionClient,
  orderedIds: string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await tx.encounterEntry.update({
      where: { id },
      data: { sortOrder: index },
      select: { id: true },
    });
  }
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
    const { campaignId } = await lockEncounter(tx, id);
    await assertPlayerNotPresent(tx, id, data.playerCharacterId);
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
    const { campaignId } = await lockEncounter(tx, existing.encounterId);
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
    await lockEncounter(tx, existing.encounterId);
    await tx.encounterEntry.delete({ where: { id } });
  });
}

async function orderedIds(
  tx: Prisma.TransactionClient,
  encounterId: string,
): Promise<string[]> {
  const rows = await tx.encounterEntry.findMany({
    where: { encounterId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Copies an entry (as "<label> copy") directly after the original. */
export async function duplicateEncounterEntry(
  entryId: string,
  db: EntryDb = getDb(),
): Promise<EncounterEntryDto> {
  const id = idSchema.parse(entryId);
  return db.$transaction(async (tx) => {
    const existing = await tx.encounterEntry.findFirst({
      where: { id, encounter: alive },
      select: entrySelect,
    });
    if (!existing) throw new EncounterEntryNotFoundError(id);
    await lockEncounter(tx, existing.encounterId);
    if (existing.kind === "player_character")
      throw new DuplicatePlayerEntryError();
    const ids = await orderedIds(tx, existing.encounterId);
    if (ids.length >= MAX_ENTRIES_PER_ENCOUNTER)
      throw new EncounterEntryLimitError();
    const suffix = " copy";
    const label = `${existing.label.slice(0, ENTRY_LABEL_MAX - suffix.length)}${suffix}`;
    const copy = await tx.encounterEntry.create({
      data: {
        kind: existing.kind,
        ruleEntryId: existing.ruleEntryId,
        npcId: existing.npcId,
        playerCharacterId: existing.playerCharacterId,
        label,
        quantity: existing.quantity,
        side: existing.side,
        hpMode: existing.hpMode,
        overrides: existing.overrides ?? Prisma.DbNull,
        startsHidden: existing.startsHidden,
        wave: existing.wave,
        encounterId: existing.encounterId,
        sortOrder: ids.length,
      },
      select: entrySelect,
    });
    ids.splice(ids.indexOf(id) + 1, 0, copy.id);
    await writeOrder(tx, ids);
    return { ...copy, sortOrder: ids.indexOf(copy.id) };
  });
}

/** Moves an entry one position up or down in the setup list. */
export async function moveEncounterEntry(
  entryId: string,
  direction: "up" | "down",
  db: EntryDb = getDb(),
): Promise<void> {
  const id = idSchema.parse(entryId);
  await db.$transaction(async (tx) => {
    const existing = await tx.encounterEntry.findFirst({
      where: { id, encounter: alive },
      select: { encounterId: true },
    });
    if (!existing) throw new EncounterEntryNotFoundError(id);
    await lockEncounter(tx, existing.encounterId);
    const ids = await orderedIds(tx, existing.encounterId);
    const from = ids.indexOf(id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await writeOrder(tx, ids);
  });
}
