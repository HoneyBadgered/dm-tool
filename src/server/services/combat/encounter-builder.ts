import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import { ENCOUNTER_TITLE_MAX_LENGTH } from "@/lib/validation/encounter";
import { idSchema } from "@/lib/validation/combat";
import {
  EncounterNotFoundError,
  deleteEncounter,
  type EncounterDto,
  type EncounterDb,
} from "@/server/services/encounters/encounters";
import type { CombatStatusValue } from "@/lib/validation/combat";
import {
  listEncounterEntries,
  type EncounterEntryDto,
} from "./encounter-entries";

export class EncounterHasOpenCombatError extends Error {
  constructor(id: string) {
    super(`Encounter has an unfinished combat: ${id}`);
    this.name = "EncounterHasOpenCombatError";
  }
}

export type BuilderDb = Pick<
  PrismaClient,
  | "$transaction"
  | "encounter"
  | "encounterEntry"
  | "combat"
  | "npc"
  | "playerCharacter"
  | "campaign"
>;

const alive = { deletedAt: null, campaign: { deletedAt: null } } as const;

export type EncounterSummary = EncounterDto & {
  /** Creatures that start in combat (wave 0). */
  combatantCount: number;
  /** Creatures prepared for later waves. */
  reinforcementCount: number;
};

export async function listEncounterSummaries(
  db: BuilderDb = getDb(),
): Promise<EncounterSummary[]> {
  const rows = await db.encounter.findMany({
    where: alive,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      campaignId: true,
      title: true,
      status: true,
      notes: true,
      objective: true,
      createdAt: true,
      updatedAt: true,
      campaign: { select: { name: true } },
      entries: { select: { quantity: true, wave: true } },
    },
  });
  return rows.map(({ campaign, entries, ...rest }) => ({
    ...rest,
    campaignName: campaign.name,
    combatantCount: entries
      .filter((e) => e.wave === 0)
      .reduce((sum, e) => sum + e.quantity, 0),
    reinforcementCount: entries
      .filter((e) => e.wave > 0)
      .reduce((sum, e) => sum + e.quantity, 0),
  }));
}

/** Copies the template (never any live combat) as a new planned encounter. */
export async function duplicateEncounter(
  id: string,
  db: BuilderDb = getDb(),
): Promise<{ id: string }> {
  const sourceId = idSchema.parse(id);
  return db.$transaction(async (tx) => {
    const source = await tx.encounter.findFirst({
      where: { id: sourceId, ...alive },
      select: {
        campaignId: true,
        title: true,
        notes: true,
        objective: true,
        entries: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!source) throw new EncounterNotFoundError(sourceId);
    const suffix = " (copy)";
    const copy = await tx.encounter.create({
      data: {
        campaignId: source.campaignId,
        title: `${source.title.slice(0, ENCOUNTER_TITLE_MAX_LENGTH - suffix.length)}${suffix}`,
        notes: source.notes,
        objective: source.objective,
        status: "planned",
      },
      select: { id: true },
    });
    for (const [index, e] of source.entries.entries()) {
      await tx.encounterEntry.create({
        data: {
          encounterId: copy.id,
          kind: e.kind,
          ruleEntryId: e.ruleEntryId,
          npcId: e.npcId,
          playerCharacterId: e.playerCharacterId,
          label: e.label,
          quantity: e.quantity,
          side: e.side,
          hpMode: e.hpMode,
          overrides: e.overrides ?? Prisma.DbNull,
          startsHidden: e.startsHidden,
          wave: e.wave,
          sortOrder: index,
        },
        select: { id: true },
      });
    }
    return copy;
  });
}

/** Soft-deletes a template unless a combat launched from it is still open. */
export async function deleteEncounterTemplate(
  id: string,
  db: BuilderDb = getDb(),
): Promise<void> {
  const parsed = idSchema.parse(id);
  const open = await db.combat.findFirst({
    where: { encounterId: parsed, status: { not: "ended" } },
    select: { id: true },
  });
  if (open) throw new EncounterHasOpenCombatError(parsed);
  await deleteEncounter(parsed, db as unknown as EncounterDb);
}

export type BuilderEntry = EncounterEntryDto & {
  /** Name of the referenced library monster, NPC or player character. */
  referenceName: string | null;
  /** The referenced record no longer exists or is inactive; launching will fail. */
  missing: boolean;
};

export type OpenCombatSummary = {
  id: string;
  name: string | null;
  status: CombatStatusValue;
  round: number;
};

export type BuilderView = {
  entries: BuilderEntry[];
  openCombats: OpenCombatSummary[];
  startingCount: number;
  reinforcementCount: number;
  waves: number[];
};

export async function getBuilderView(
  encounterId: string,
  db: BuilderDb = getDb(),
): Promise<BuilderView> {
  const id = idSchema.parse(encounterId);
  const entries = await listEncounterEntries(id, db as never);
  const refs = await db.encounterEntry.findMany({
    where: { encounterId: id },
    select: {
      id: true,
      ruleEntry: { select: { name: true, isActive: true } },
      npc: { select: { name: true, deletedAt: true } },
      playerCharacter: { select: { name: true, deletedAt: true } },
    },
  });
  const refById = new Map(refs.map((r) => [r.id, r]));
  const view: BuilderEntry[] = entries.map((entry) => {
    const ref = refById.get(entry.id);
    let referenceName: string | null = null;
    let missing = false;
    if (entry.kind === "monster") {
      referenceName = ref?.ruleEntry?.name ?? null;
      missing = !ref?.ruleEntry || !ref.ruleEntry.isActive;
    } else if (entry.kind === "npc") {
      referenceName = ref?.npc?.name ?? null;
      missing = !ref?.npc || ref.npc.deletedAt !== null;
    } else if (entry.kind === "player_character") {
      referenceName = ref?.playerCharacter?.name ?? null;
      missing = !ref?.playerCharacter || ref.playerCharacter.deletedAt !== null;
    }
    return { ...entry, referenceName, missing };
  });
  const openCombats = await db.combat.findMany({
    where: { encounterId: id, status: { not: "ended" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, round: true },
  });
  const count = (wave: (w: number) => boolean) =>
    view.filter((e) => wave(e.wave)).reduce((s, e) => s + e.quantity, 0);
  return {
    entries: view,
    openCombats,
    startingCount: count((w) => w === 0),
    reinforcementCount: count((w) => w > 0),
    waves: [...new Set(view.map((e) => e.wave))].sort((a, b) => a - b),
  };
}

export type CreatureOptions = {
  npcs: { id: string; name: string; role: string | null }[];
  playerCharacters: {
    id: string;
    name: string;
    playerName: string | null;
    maxHp: number;
    armorClass: number;
  }[];
};

/** NPCs and player characters that can be added to an encounter of this campaign. */
export async function listCreatureOptions(
  campaignId: string,
  db: BuilderDb = getDb(),
): Promise<CreatureOptions> {
  const id = idSchema.parse(campaignId);
  const [npcs, playerCharacters] = await Promise.all([
    db.npc.findMany({
      where: { campaignId: id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    db.playerCharacter.findMany({
      where: { campaignId: id, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        playerName: true,
        maxHp: true,
        armorClass: true,
      },
    }),
  ]);
  return { npcs, playerCharacters };
}
