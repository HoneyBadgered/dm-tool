import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  SNAPSHOT_SCHEMA_VERSION,
  creatureSnapshotSchema,
  entryOverridesSchema,
  type CreatureKindValue,
  type CreatureSnapshot,
  type EntryOverrides,
  type HpModeValue,
} from "@/lib/validation/combat";
import { getMonsterDetail } from "@/server/services/rules/rules";
import { parseDice, rollDice, type Rng } from "./dice";

export class CreatureTemplateNotFoundError extends Error {
  constructor(what: string) {
    super(`Creature template not found: ${what}`);
    this.name = "CreatureTemplateNotFoundError";
  }
}

export class IncompleteCreatureError extends Error {
  constructor(what: string) {
    super(`Creature is missing required stats: ${what}`);
    this.name = "IncompleteCreatureError";
  }
}

export type CreatureTemplateDb = Pick<
  PrismaClient,
  "ruleEntry" | "ruleSource" | "npc" | "playerCharacter"
>;

export type EntryReference = {
  kind: CreatureKindValue;
  label: string;
  ruleEntryId: string | null;
  npcId: string | null;
  playerCharacterId: string | null;
  overrides: unknown;
};

export type ResolvedCreature = {
  snapshot: CreatureSnapshot;
  ruleEntryId: string | null;
  contentHash: string | null;
  npcId: string | null;
  playerCharacterId: string | null;
  /** Starting combatant notes, copied from the source record. */
  notes?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function readFirstArmorClass(raw: unknown): number | null {
  if (!isRecord(raw) || !Array.isArray(raw.armor_class)) return null;
  for (const entry of raw.armor_class) {
    if (isRecord(entry) && typeof entry.value === "number") return entry.value;
  }
  return null;
}

function readAttacks(raw: unknown): CreatureSnapshot["attacks"] {
  if (!isRecord(raw) || !Array.isArray(raw.actions)) return [];
  return raw.actions.flatMap((action) => {
    if (!isRecord(action) || typeof action.name !== "string") return [];
    const attackBonus =
      typeof action.attack_bonus === "number" &&
      Number.isInteger(action.attack_bonus)
        ? action.attack_bonus
        : null;
    const damage = Array.isArray(action.damage)
      ? action.damage.flatMap((part) => {
          if (!isRecord(part) || typeof part.damage_dice !== "string")
            return [];
          const dice = part.damage_dice.trim();
          if (!parseDice(dice)) return [];
          const type = isRecord(part.damage_type)
            ? part.damage_type.name
            : null;
          return [
            {
              dice,
              damageType: typeof type === "string" ? type : null,
            },
          ];
        })
      : [];
    return attackBonus === null && damage.length === 0
      ? []
      : [{ name: action.name, attackBonus, damage }];
  });
}

function emptyStats(): Omit<
  CreatureSnapshot,
  | "kind"
  | "name"
  | "armorClass"
  | "maxHp"
  | "hpAverage"
  | "hpRoll"
  | "initiativeModifier"
  | "source"
> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    speed: [],
    abilityScores: [],
    savingThrowsAndSkills: [],
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    senses: [],
    languages: [],
    challengeRating: null,
    experience: null,
    sections: [],
    attacks: [],
  };
}

function parseOverrides(value: unknown): EntryOverrides {
  return value == null ? {} : entryOverridesSchema.parse(value);
}

async function resolveMonster(
  ruleEntryId: string,
  kind: CreatureKindValue,
  name: string,
  overrides: EntryOverrides,
  db: CreatureTemplateDb,
): Promise<ResolvedCreature> {
  // Only active imported monsters resolve: homebrew monster creation does not exist yet.
  const detail = await getMonsterDetail(ruleEntryId, db);
  if (!detail)
    throw new CreatureTemplateNotFoundError(`monster ${ruleEntryId}`);
  const row = await db.ruleEntry.findFirst({
    where: { id: ruleEntryId },
    select: { rawData: true, contentHash: true },
  });
  if (!row) throw new CreatureTemplateNotFoundError(`monster ${ruleEntryId}`);

  const armorClass = overrides.armorClass ?? readFirstArmorClass(row.rawData);
  if (armorClass === null) throw new IncompleteCreatureError("armor class");
  const maxHp = overrides.maxHp ?? detail.hitPoints;
  if (maxHp === null || maxHp === undefined)
    throw new IncompleteCreatureError("hit points");
  const dex = detail.abilityScores.find((score) => score.label === "DEX");
  const rawRoll =
    isRecord(row.rawData) && typeof row.rawData.hit_points_roll === "string"
      ? row.rawData.hit_points_roll.trim()
      : null;
  // hit_points_roll includes the Constitution modifier; hit_dice does not.
  const hpRoll =
    rawRoll && parseDice(rawRoll)
      ? rawRoll
      : detail.hitDice && parseDice(detail.hitDice)
        ? detail.hitDice
        : null;

  return {
    snapshot: creatureSnapshotSchema.parse({
      ...emptyStats(),
      kind,
      name,
      armorClass,
      maxHp,
      hpAverage: detail.hitPoints,
      hpRoll,
      // DEX-derived convenience: the source data has no initiative field.
      initiativeModifier:
        overrides.initiativeModifier ?? (dex ? abilityModifier(dex.value) : 0),
      speed: detail.speed,
      abilityScores: detail.abilityScores,
      savingThrowsAndSkills: detail.savingThrowsAndSkills,
      damageVulnerabilities: detail.damageVulnerabilities,
      damageResistances: detail.damageResistances,
      damageImmunities: detail.damageImmunities,
      conditionImmunities: detail.conditionImmunities,
      senses: detail.senses,
      languages: detail.languages,
      challengeRating: detail.challengeRating,
      experience: detail.experience,
      sections: detail.sections,
      attacks: readAttacks(row.rawData),
      source: {
        ruleEntryId: detail.id,
        sourceKey: detail.sourceKey,
        contentHash: row.contentHash,
        srdLabel: detail.source.srdLabel,
        apiEdition: detail.source.apiEdition,
        verifiedSrdRevision: detail.source.verifiedSrdRevision,
      },
    }),
    ruleEntryId: detail.id,
    contentHash: row.contentHash,
    npcId: null,
    playerCharacterId: null,
  };
}

function manualSnapshot(
  kind: CreatureKindValue,
  name: string,
  stats: { maxHp?: number; armorClass?: number },
  initiativeModifier: number,
): CreatureSnapshot {
  if (stats.maxHp === undefined)
    throw new IncompleteCreatureError("hit points");
  if (stats.armorClass === undefined)
    throw new IncompleteCreatureError("armor class");
  return creatureSnapshotSchema.parse({
    ...emptyStats(),
    kind,
    name,
    armorClass: stats.armorClass,
    maxHp: stats.maxHp,
    hpAverage: null,
    hpRoll: null,
    initiativeModifier,
    source: null,
  });
}

/**
 * Builds a frozen snapshot for one encounter entry. Source records are only read,
 * and campaign ownership of NPCs and players is verified.
 */
export async function resolveCreature(
  entry: EntryReference,
  campaignId: string,
  db: CreatureTemplateDb,
): Promise<ResolvedCreature> {
  const overrides = parseOverrides(entry.overrides);

  if (entry.kind === "monster") {
    if (!entry.ruleEntryId)
      throw new CreatureTemplateNotFoundError("monster reference");
    return resolveMonster(
      entry.ruleEntryId,
      "monster",
      entry.label,
      overrides,
      db,
    );
  }

  if (entry.kind === "npc") {
    if (!entry.npcId) throw new CreatureTemplateNotFoundError("npc reference");
    const npc = await db.npc.findFirst({
      where: { id: entry.npcId, campaignId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!npc) throw new CreatureTemplateNotFoundError(`npc ${entry.npcId}`);
    if (entry.ruleEntryId) {
      const resolved = await resolveMonster(
        entry.ruleEntryId,
        "npc",
        entry.label || npc.name,
        overrides,
        db,
      );
      return { ...resolved, npcId: npc.id };
    }
    return {
      snapshot: manualSnapshot(
        "npc",
        entry.label || npc.name,
        overrides,
        overrides.initiativeModifier ?? 0,
      ),
      ruleEntryId: null,
      contentHash: null,
      npcId: npc.id,
      playerCharacterId: null,
    };
  }

  if (entry.kind === "player_character") {
    if (!entry.playerCharacterId)
      throw new CreatureTemplateNotFoundError("player reference");
    const pc = await db.playerCharacter.findFirst({
      where: { id: entry.playerCharacterId, campaignId, deletedAt: null },
      select: {
        id: true,
        name: true,
        maxHp: true,
        armorClass: true,
        initiativeModifier: true,
        characterClass: true,
        race: true,
        level: true,
        playerName: true,
        speed: true,
        passivePerception: true,
        abilityScores: true,
        notes: true,
      },
    });
    if (!pc)
      throw new CreatureTemplateNotFoundError(
        `player ${entry.playerCharacterId}`,
      );
    const base = manualSnapshot(
      "player_character",
      entry.label || pc.name,
      {
        maxHp: overrides.maxHp ?? pc.maxHp,
        armorClass: overrides.armorClass ?? pc.armorClass,
      },
      overrides.initiativeModifier ?? pc.initiativeModifier,
    );
    const scores = Array.isArray(pc.abilityScores)
      ? (pc.abilityScores as { label: string; value: number }[])
      : [];
    const about = [
      pc.race,
      pc.characterClass,
      pc.level !== null && `Level ${pc.level}`,
      pc.playerName && `Player: ${pc.playerName}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      snapshot: creatureSnapshotSchema.parse({
        ...base,
        speed: pc.speed ? [pc.speed] : [],
        abilityScores: scores,
        senses:
          pc.passivePerception !== null
            ? [`Passive Perception ${pc.passivePerception}`]
            : [],
        sections: about
          ? [
              {
                title: "Character",
                entries: [{ name: "Details", description: about }],
              },
            ]
          : [],
      }),
      ruleEntryId: null,
      contentHash: null,
      npcId: null,
      playerCharacterId: pc.id,
      notes: pc.notes,
    };
  }

  return {
    snapshot: manualSnapshot(
      "custom",
      entry.label,
      overrides,
      overrides.initiativeModifier ?? 0,
    ),
    ruleEntryId: null,
    contentHash: null,
    npcId: null,
    playerCharacterId: null,
  };
}

/** Starting HP for one combatant. An explicit maxHp override always wins. */
export function chooseStartingHp(
  snapshot: CreatureSnapshot,
  mode: HpModeValue,
  overrides: EntryOverrides,
  rng: Rng = Math.random,
): { maxHp: number; rolled: boolean } {
  if (overrides.maxHp !== undefined || mode === "manual") {
    return { maxHp: snapshot.maxHp, rolled: false };
  }
  if (mode === "rolled" && snapshot.hpRoll) {
    const roll = rollDice(snapshot.hpRoll, rng);
    if (roll) return { maxHp: Math.max(1, roll.total), rolled: true };
  }
  return { maxHp: snapshot.hpAverage ?? snapshot.maxHp, rolled: false };
}

export function toSnapshotJson(
  snapshot: CreatureSnapshot,
): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function readSnapshot(value: unknown): CreatureSnapshot | null {
  const parsed = creatureSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
