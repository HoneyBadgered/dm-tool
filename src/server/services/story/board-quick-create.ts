import { getDb } from "@/lib/db/client";
import { idSchema } from "@/lib/validation/board";
import { createNpc, updateNpcNotes } from "@/server/services/npcs/npcs";
import { createRecord, updateRecord } from "./records";
import { createEncounter } from "@/server/services/encounters/encounters";
import { BoardNotFoundError, type BoardDb } from "./boards";

export type QuickCreateInput =
  | {
      kind: "npc";
      name: string;
      role?: string;
      race?: string;
      characterClass?: string;
      level?: number | null;
      location?: string;
    }
  | { kind: "encounter"; title: string; objective?: string }
  | {
      kind: "record";
      recordKind: string;
      name: string;
      summary?: string;
    };

/**
 * Creates a real NPC or encounter in the board's campaign, ready to be placed
 * as a card. Validation is the same as the regular create forms.
 */
export async function quickCreateForBoard(
  boardId: string,
  input: QuickCreateInput,
  db: BoardDb = getDb(),
): Promise<{ type: string; id: string; label: string }> {
  const board = await db.board.findFirst({
    where: { id: idSchema.parse(boardId), deletedAt: null },
    select: { campaignId: true },
  });
  if (!board) throw new BoardNotFoundError(boardId);
  if (input.kind === "npc") {
    const { kind: _kind, ...rest } = input;
    void _kind;
    const npc = await createNpc({ ...rest, campaignId: board.campaignId }, db);
    return { type: "npc", id: npc.id, label: npc.name };
  }
  if (input.kind === "record") {
    const rec = await createRecord(
      {
        campaignId: board.campaignId,
        kind: input.recordKind,
        name: input.name,
        summary: input.summary,
      },
      db,
    );
    return { type: `record:${rec.kind}`, id: rec.id, label: rec.name };
  }
  const enc = await createEncounter(
    {
      title: input.title,
      objective: input.objective,
      campaignId: board.campaignId,
    },
    db,
  );
  return { type: "encounter", id: enc.id, label: enc.title };
}

/**
 * Edits the text (summary) of a clue card's linked record. The node must sit
 * on this board and link to a live clue in the board's campaign.
 */
export async function updateClueTextForBoard(
  boardId: string,
  nodeId: string,
  text: string,
  db: BoardDb = getDb(),
): Promise<string | null> {
  const node = await db.boardNode.findFirst({
    where: {
      id: idSchema.parse(nodeId),
      boardId: idSchema.parse(boardId),
      board: { deletedAt: null },
      record: { kind: "clue", deletedAt: null },
    },
    select: {
      record: { select: { id: true, name: true, campaignId: true } },
      board: { select: { campaignId: true } },
    },
  });
  if (!node?.record || node.record.campaignId !== node.board.campaignId)
    throw new BoardNotFoundError(boardId);
  const updated = await updateRecord(
    node.record.id,
    { kind: "clue", name: node.record.name, summary: text },
    db,
  );
  return updated.summary;
}

/**
 * Edits the free-form notes of an NPC or faction card's linked record (NPC
 * notes, or the faction's DM notes). The node must sit on this board.
 */
export async function updateCardNotesForBoard(
  boardId: string,
  nodeId: string,
  text: string,
  db: BoardDb = getDb(),
): Promise<string | null> {
  const node = await db.boardNode.findFirst({
    where: {
      id: idSchema.parse(nodeId),
      boardId: idSchema.parse(boardId),
      board: { deletedAt: null },
    },
    select: {
      npc: { select: { id: true, campaignId: true, deletedAt: true } },
      record: {
        select: {
          id: true,
          kind: true,
          name: true,
          summary: true,
          campaignId: true,
          deletedAt: true,
        },
      },
      board: { select: { campaignId: true } },
    },
  });
  if (!node) throw new BoardNotFoundError(boardId);
  const campaignId = node.board.campaignId;
  if (node.npc && !node.npc.deletedAt && node.npc.campaignId === campaignId) {
    await updateNpcNotes(node.npc.id, { notes: text }, db);
    const npc = await db.npc.findUnique({
      where: { id: node.npc.id },
      select: { notes: true },
    });
    return npc?.notes ?? null;
  }
  const r = node.record;
  if (
    r &&
    !r.deletedAt &&
    r.kind === "faction" &&
    r.campaignId === campaignId
  ) {
    const updated = await updateRecord(
      r.id,
      { kind: "faction", name: r.name, summary: r.summary, dmNotes: text },
      db,
    );
    return updated.dmNotes;
  }
  throw new BoardNotFoundError(boardId);
}
