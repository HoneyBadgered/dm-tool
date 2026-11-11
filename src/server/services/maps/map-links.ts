import { getDb } from "@/lib/db/client";
import {
  parseSpeedFeet,
  type LinkTarget,
  type MapCombatInfo,
  type RecordInfo,
} from "@/lib/battle-map-links";
import type { TokenLink } from "@/lib/validation/battle-map";
import { getCombat } from "@/server/services/combat/live-combat";
import { searchBoardMonsters } from "@/server/services/story/board-encounter";
import { resolveCreature } from "@/server/services/combat/creature-templates";
import type { BattleMapDb } from "@/server/services/maps/battle-maps";

const alive = { deletedAt: null } as const;

/** Live combat state in the shape the map needs, or null if it is gone. */
export async function getCombatInfo(
  combatId: string,
  campaignId: string,
  db: BattleMapDb = getDb(),
): Promise<MapCombatInfo | null> {
  const combat = await getCombat(combatId, db);
  if (!combat || combat.campaignId !== campaignId) return null;
  const effects = new Map<string, string[]>();
  for (const e of combat.effects) {
    const list = effects.get(e.targetId) ?? [];
    list.push(e.name);
    effects.set(e.targetId, list);
  }
  return {
    id: combat.id,
    name: combat.name,
    status: combat.status,
    round: combat.round,
    version: combat.version,
    activeCombatantId: combat.activeCombatantId,
    combatants: combat.combatants.map((c) => ({
      id: c.id,
      name: c.name,
      side: c.side,
      status: c.status,
      isHidden: c.isHidden,
      hp: c.currentHp,
      maxHp: c.maxHp,
      tempHp: c.tempHp,
      ac: c.armorClass,
      initiative: c.initiative,
      speed: c.snapshot ? parseSpeedFeet(c.snapshot.speed) : null,
      effects: effects.get(c.id) ?? [],
    })),
  };
}

/** Stat summary for a linked PC, NPC, or monster. Missing stats stay null. */
export async function getRecordInfo(
  link: TokenLink,
  campaignId: string,
  db: BattleMapDb = getDb(),
): Promise<RecordInfo | null> {
  if (link.kind === "combatant") return null;
  if (link.kind === "player_character") {
    const pc = await db.playerCharacter.findFirst({
      where: { id: link.id, campaignId, ...alive },
      select: {
        id: true,
        name: true,
        maxHp: true,
        armorClass: true,
        speed: true,
      },
    });
    if (!pc) return null;
    return {
      kind: link.kind,
      id: pc.id,
      name: pc.name,
      ac: pc.armorClass,
      maxHp: pc.maxHp,
      speed: pc.speed ? parseSpeedFeet([pc.speed]) : null,
      detail: "Player character",
      href: `/campaigns/${campaignId}`,
    };
  }
  if (link.kind === "npc") {
    const npc = await db.npc.findFirst({
      where: { id: link.id, campaignId, ...alive },
      select: { id: true, name: true, role: true, challengeRating: true },
    });
    if (!npc) return null;
    return {
      kind: link.kind,
      id: npc.id,
      name: npc.name,
      ac: null,
      maxHp: null,
      speed: null,
      detail:
        [npc.role, npc.challengeRating ? `CR ${npc.challengeRating}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/npcs/${npc.id}`,
    };
  }
  const entry = await db.ruleEntry.findFirst({
    where: { id: link.id, category: "monsters" },
    select: { id: true, name: true },
  });
  if (!entry) return null;
  const { snapshot } = await resolveCreature(
    {
      kind: "monster",
      label: entry.name,
      ruleEntryId: entry.id,
      npcId: null,
      playerCharacterId: null,
      overrides: null,
    },
    campaignId,
    db,
  );
  return {
    kind: "monster",
    id: entry.id,
    name: entry.name,
    ac: snapshot.armorClass,
    maxHp: snapshot.maxHp,
    speed: parseSpeedFeet(snapshot.speed),
    detail: snapshot.challengeRating ? `CR ${snapshot.challengeRating}` : null,
    href: `/rules/monsters/${entry.id}`,
  };
}

export async function searchLinkTargets(
  kind: "player_character" | "npc" | "monster",
  campaignId: string,
  query: string,
  db: BattleMapDb = getDb(),
): Promise<LinkTarget[]> {
  const q = query.trim().slice(0, 100);
  if (kind === "monster") return searchBoardMonsters(q, db);
  const contains = q
    ? { contains: q, mode: "insensitive" as const }
    : undefined;
  if (kind === "npc") {
    const rows = await db.npc.findMany({
      where: { campaignId, ...alive, name: contains },
      orderBy: { name: "asc" },
      take: 15,
      select: { id: true, name: true, role: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, detail: r.role }));
  }
  const rows = await db.playerCharacter.findMany({
    where: { campaignId, ...alive, name: contains },
    orderBy: { name: "asc" },
    take: 15,
    select: { id: true, name: true, playerName: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, detail: r.playerName }));
}

/** Drops links that point at records outside this map's campaign or combat. */
export async function sanitizeTokenLinks<T extends { link: TokenLink | null }>(
  tokens: T[],
  campaignId: string,
  combatId: string | null,
  db: BattleMapDb,
): Promise<T[]> {
  const ids = (kind: TokenLink["kind"]) => [
    ...new Set(
      tokens.flatMap((t) => (t.link?.kind === kind ? [t.link.id] : [])),
    ),
  ];
  const ok = new Set<string>();
  const add = (kind: string, rows: { id: string }[]) =>
    rows.forEach((r) => ok.add(`${kind}:${r.id}`));
  const [combatants, pcs, npcs, monsters] = await Promise.all([
    combatId && ids("combatant").length
      ? db.combatant.findMany({
          where: { id: { in: ids("combatant") }, combatId },
          select: { id: true },
        })
      : [],
    ids("player_character").length
      ? db.playerCharacter.findMany({
          where: { id: { in: ids("player_character") }, campaignId, ...alive },
          select: { id: true },
        })
      : [],
    ids("npc").length
      ? db.npc.findMany({
          where: { id: { in: ids("npc") }, campaignId, ...alive },
          select: { id: true },
        })
      : [],
    ids("monster").length
      ? db.ruleEntry.findMany({
          where: { id: { in: ids("monster") }, category: "monsters" },
          select: { id: true },
        })
      : [],
  ]);
  add("combatant", combatants);
  add("player_character", pcs);
  add("npc", npcs);
  add("monster", monsters);
  return tokens.map((t) =>
    t.link && !ok.has(`${t.link.kind}:${t.link.id}`) ? { ...t, link: null } : t,
  );
}
