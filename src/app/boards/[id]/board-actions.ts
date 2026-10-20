"use server";

import { ZodError } from "zod";
import {
  BoardConflictError,
  BoardNotFoundError,
  BoardRuleError,
  applyBoardCommand,
  getBoard,
  type BoardCommandName,
  type BoardView,
} from "@/server/services/story/boards";
import {
  getNodeDetail,
  listLinkable,
  type LinkableItem,
  type NodeDetail,
} from "@/server/services/story/board-detail";
import {
  quickCreateForBoard,
  type QuickCreateInput,
} from "@/server/services/story/board-quick-create";
import {
  addCreatureForBoard,
  getBoardEncounter,
  removeCreatureForBoard,
  searchBoardMonsters,
  type AddCreatureInput,
  type BoardEncounterView,
} from "@/server/services/story/board-encounter";
import {
  DuplicatePlayerEntryError,
  EncounterEntryLimitError,
  EncounterEntryNotFoundError,
} from "@/server/services/combat/encounter-entries";
import { IncompleteCreatureError } from "@/server/services/combat/creature-templates";
import { boardCommands } from "@/lib/validation/board";

export type CommandResult =
  | { ok: true; version: number; id?: string }
  | { ok: false; error: string; conflict?: boolean };

export async function runBoardCommand(
  name: BoardCommandName,
  input: unknown,
): Promise<CommandResult> {
  if (!Object.hasOwn(boardCommands, name))
    return { ok: false, error: "Unknown board command" };
  try {
    return { ok: true, ...(await applyBoardCommand(name, input)) };
  } catch (e) {
    if (e instanceof BoardConflictError)
      return {
        ok: false,
        conflict: true,
        error: "The board changed elsewhere. Reload to continue.",
      };
    if (e instanceof BoardRuleError || e instanceof BoardNotFoundError)
      return { ok: false, error: e.message };
    if (e instanceof ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error("board command failed", name, e);
    return { ok: false, error: "Could not save. Try again." };
  }
}

export async function fetchNodeDetail(
  boardId: string,
  nodeId: string,
): Promise<NodeDetail | null> {
  try {
    return await getNodeDetail(boardId, nodeId);
  } catch {
    return null;
  }
}

export async function fetchLinkable(boardId: string): Promise<LinkableItem[]> {
  try {
    return await listLinkable(boardId);
  } catch {
    return [];
  }
}

/** Fresh server state, used to resync after undo/redo and bulk edits. */
export async function fetchBoardView(
  boardId: string,
): Promise<BoardView | null> {
  try {
    return await getBoard(boardId);
  } catch {
    return null;
  }
}

export type QuickCreateResult =
  | { ok: true; type: string; id: string; label: string }
  | { ok: false; error: string };

/** Creates a new NPC or encounter in the board's campaign. */
export async function quickCreateRecord(
  boardId: string,
  input: QuickCreateInput,
): Promise<QuickCreateResult> {
  try {
    return { ok: true, ...(await quickCreateForBoard(boardId, input)) };
  } catch (e) {
    if (e instanceof ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    if (e instanceof BoardNotFoundError) return { ok: false, error: e.message };
    console.error("quick create failed", e);
    return { ok: false, error: "Could not create it. Try again." };
  }
}

export type EncounterOpResult =
  { ok: true; view: BoardEncounterView } | { ok: false; error: string };

function encounterError(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Invalid input";
  if (
    e instanceof BoardNotFoundError ||
    e instanceof BoardRuleError ||
    e instanceof DuplicatePlayerEntryError ||
    e instanceof EncounterEntryLimitError ||
    e instanceof EncounterEntryNotFoundError ||
    e instanceof IncompleteCreatureError
  )
    return e.message;
  console.error("board encounter op failed", e);
  return "Could not update the encounter. Try again.";
}

export async function fetchBoardEncounter(
  boardId: string,
  nodeId: string,
): Promise<BoardEncounterView | null> {
  try {
    return await getBoardEncounter(boardId, nodeId);
  } catch {
    return null;
  }
}

export async function searchMonsters(
  query: string,
): Promise<{ id: string; name: string; detail: string }[]> {
  try {
    return await searchBoardMonsters(query);
  } catch {
    return [];
  }
}

export async function addEncounterCreature(
  boardId: string,
  nodeId: string,
  input: AddCreatureInput,
): Promise<EncounterOpResult> {
  try {
    await addCreatureForBoard(boardId, nodeId, input);
    return { ok: true, view: await getBoardEncounter(boardId, nodeId) };
  } catch (e) {
    return { ok: false, error: encounterError(e) };
  }
}

export async function removeEncounterCreature(
  boardId: string,
  nodeId: string,
  entryId: string,
): Promise<EncounterOpResult> {
  try {
    await removeCreatureForBoard(boardId, nodeId, entryId);
    return { ok: true, view: await getBoardEncounter(boardId, nodeId) };
  } catch (e) {
    return { ok: false, error: encounterError(e) };
  }
}
