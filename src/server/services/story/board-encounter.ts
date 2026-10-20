import { getDb } from "@/lib/db/client";
import { idSchema } from "@/lib/validation/board";
import { MAX_ENTRY_QUANTITY } from "@/lib/validation/combat";
import {
  addEncounterEntry,
  removeEncounterEntry,
} from "@/server/services/combat/encounter-entries";
import { listMonsters } from "@/server/services/rules/rules";
import { BoardNotFoundError, BoardRuleError, type BoardDb } from "./boards";

export type BoardEncounterCreature = {
  id: string;
  label: string;
  quantity: number;
  kind: string;
};

export type BoardEncounterView = {
  encounterId: string;
  status: string;
  creatures: BoardEncounterCreature[];
  npcs: { id: string; name: string }[];
  playerCharacters: { id: string; name: string }[];
};

export type AddCreatureInput =
  | { kind: "monster"; ruleEntryId: string; quantity?: number }
  | { kind: "npc"; npcId: string; maxHp: number; armorClass: number }
  | { kind: "player_character"; playerCharacterId: string };

/** The card's encounter, only if the card is on this board and alive. */
async function boardEncounter(boardId: string, nodeId: string, db: BoardDb) {
  const node = await db.boardNode.findFirst({
    where: {
      id: idSchema.parse(nodeId),
      boardId: idSchema.parse(boardId),
      board: { deletedAt: null },
      encounterId: { not: null },
    },
    select: {
      board: { select: { campaignId: true } },
      encounter: {
        select: { id: true, status: true, deletedAt: true, campaignId: true },
      },
    },
  });
  const enc = node?.encounter;
  if (
    !node ||
    !enc ||
    enc.deletedAt ||
    enc.campaignId !== node.board.campaignId
  )
    throw new BoardNotFoundError(boardId);
  return { campaignId: node.board.campaignId, encounter: enc };
}

export async function getBoardEncounter(
  boardId: string,
  nodeId: string,
  db: BoardDb = getDb(),
): Promise<BoardEncounterView> {
  const { campaignId, encounter } = await boardEncounter(boardId, nodeId, db);
  const [entries, npcs, pcs] = await Promise.all([
    db.encounterEntry.findMany({
      where: { encounterId: encounter.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true, quantity: true, kind: true },
    }),
    db.npc.findMany({
      where: { campaignId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.playerCharacter.findMany({
      where: { campaignId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    encounterId: encounter.id,
    status: encounter.status,
    creatures: entries,
    npcs,
    playerCharacters: pcs,
  };
}

export async function searchBoardMonsters(query: string, db = getDb()) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const list = await listMonsters({ query: q }, db);
  return list.items.slice(0, 15).map((m) => ({
    id: m.id,
    name: m.name,
    detail: `CR ${m.challengeRating} · ${m.size} ${m.type}`,
  }));
}

export async function addCreatureForBoard(
  boardId: string,
  nodeId: string,
  input: AddCreatureInput,
  db: BoardDb = getDb(),
): Promise<void> {
  const { campaignId, encounter } = await boardEncounter(boardId, nodeId, db);
  if (input.kind === "monster") {
    const monster = await db.ruleEntry.findFirst({
      where: { id: idSchema.parse(input.ruleEntryId), category: "monsters" },
      select: { name: true },
    });
    if (!monster)
      throw new BoardRuleError("That monster is not in the library");
    const quantity = Math.min(
      MAX_ENTRY_QUANTITY,
      Math.max(1, Math.trunc(input.quantity ?? 1)),
    );
    await addEncounterEntry(
      encounter.id,
      {
        kind: "monster",
        ruleEntryId: input.ruleEntryId,
        label: monster.name,
        quantity,
        hpMode: "average",
      },
      db,
    );
    return;
  }
  if (input.kind === "npc") {
    const npc = await db.npc.findFirst({
      where: { id: idSchema.parse(input.npcId), campaignId, deletedAt: null },
      select: { name: true },
    });
    if (!npc) throw new BoardRuleError("That NPC is not in this campaign");
    await addEncounterEntry(
      encounter.id,
      {
        kind: "npc",
        npcId: input.npcId,
        label: npc.name,
        hpMode: "manual",
        overrides: { maxHp: input.maxHp, armorClass: input.armorClass },
      },
      db,
    );
    return;
  }
  const pc = await db.playerCharacter.findFirst({
    where: {
      id: idSchema.parse(input.playerCharacterId),
      campaignId,
      deletedAt: null,
    },
    select: { name: true },
  });
  if (!pc) throw new BoardRuleError("That character is not in this campaign");
  await addEncounterEntry(
    encounter.id,
    {
      kind: "player_character",
      playerCharacterId: input.playerCharacterId,
      label: pc.name,
      quantity: 1,
      hpMode: "manual",
    },
    db,
  );
}

export async function removeCreatureForBoard(
  boardId: string,
  nodeId: string,
  entryId: string,
  db: BoardDb = getDb(),
): Promise<void> {
  const { encounter } = await boardEncounter(boardId, nodeId, db);
  const entry = await db.encounterEntry.findFirst({
    where: { id: idSchema.parse(entryId), encounterId: encounter.id },
    select: { id: true },
  });
  if (!entry)
    throw new BoardRuleError("That creature is not in this encounter");
  await removeEncounterEntry(entry.id, db);
}
