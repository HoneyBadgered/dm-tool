import { getDb } from "@/lib/db/client";
import { idSchema } from "@/lib/validation/board";
import { createNpc } from "@/server/services/npcs/npcs";
import { createRecord } from "./records";
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
