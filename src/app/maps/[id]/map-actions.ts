"use server";

import { ZodError } from "zod";
import {
  BattleMapConflictError,
  BattleMapImageError,
  BattleMapNotFoundError,
  clearBattleMapBackground,
  createBattleMap,
  getBattleMap,
  saveBattleMap,
  setMapCombat,
} from "@/server/services/maps/battle-maps";
import {
  getCombatInfo,
  getRecordInfo,
  searchLinkTargets,
} from "@/server/services/maps/map-links";
import {
  CombatConflictError,
  CombatantNotFoundError,
  InvalidCombatStateError,
  advanceTurn,
  applyDamageCommand,
  applyHealCommand,
  setActiveCombatant,
} from "@/server/services/combat/live-combat";
import { playerView } from "@/lib/battle-map-vision";
import type {
  LinkTarget,
  MapCombatInfo,
  RecordInfo,
} from "@/lib/battle-map-links";
import {
  tokenLinkSchema,
  type MapDoc,
  type TokenLink,
} from "@/lib/validation/battle-map";

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; error: string; conflict?: boolean };

export async function saveMapAction(
  id: string,
  expectedVersion: number,
  doc: MapDoc,
): Promise<SaveResult> {
  try {
    return { ok: true, ...(await saveBattleMap(id, { expectedVersion, doc })) };
  } catch (e) {
    if (e instanceof BattleMapConflictError)
      return {
        ok: false,
        conflict: true,
        error: "The map changed elsewhere. Reload to continue.",
      };
    if (e instanceof BattleMapNotFoundError)
      return { ok: false, error: "This map no longer exists." };
    if (e instanceof ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Invalid map" };
    console.error("map save failed", e);
    return { ok: false, error: "Could not save. Try again." };
  }
}

export async function clearMapBackgroundAction(
  id: string,
): Promise<{ ok: boolean }> {
  try {
    await clearBattleMapBackground(id);
    return { ok: true };
  } catch (e) {
    if (e instanceof BattleMapNotFoundError || e instanceof ZodError)
      return { ok: false };
    console.error("map background clear failed", e);
    return { ok: false };
  }
}

/** Creates a new room map in the same campaign as `fromMapId`. */
export async function createLinkedMapAction(
  fromMapId: string,
  name: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false }> {
  try {
    const from = await getBattleMap(fromMapId);
    if (!from) return { ok: false };
    const { id } = await createBattleMap({ campaignId: from.campaignId, name });
    return { ok: true, id, name: name.trim() };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false };
    console.error("linked map create failed", e);
    return { ok: false };
  }
}

export type CombatInfoResult =
  { ok: true; info: MapCombatInfo | null } | { ok: false; error: string };

async function infoFor(mapId: string): Promise<MapCombatInfo | null> {
  const map = await getBattleMap(mapId);
  if (!map?.combatId) return null;
  return getCombatInfo(map.combatId, map.campaignId);
}

export async function setMapCombatAction(
  mapId: string,
  combatId: string | null,
): Promise<CombatInfoResult> {
  try {
    await setMapCombat(mapId, combatId);
    return { ok: true, info: await infoFor(mapId) };
  } catch (e) {
    if (
      e instanceof BattleMapNotFoundError ||
      e instanceof BattleMapImageError ||
      e instanceof ZodError
    )
      return { ok: false, error: "That combat is not available." };
    console.error("map combat attach failed", e);
    return { ok: false, error: "Could not attach the combat." };
  }
}

export async function refreshCombatInfoAction(
  mapId: string,
): Promise<CombatInfoResult> {
  try {
    return { ok: true, info: await infoFor(mapId) };
  } catch (e) {
    console.error("map combat refresh failed", e);
    return { ok: false, error: "Could not load the combat." };
  }
}

export async function lookupLinkAction(
  mapId: string,
  link: TokenLink,
): Promise<RecordInfo | null> {
  try {
    const parsed = tokenLinkSchema.parse(link);
    const map = await getBattleMap(mapId);
    return map ? await getRecordInfo(parsed, map.campaignId) : null;
  } catch (e) {
    if (!(e instanceof ZodError)) console.error("link lookup failed", e);
    return null;
  }
}

export async function searchLinkTargetsAction(
  mapId: string,
  kind: "player_character" | "npc" | "monster",
  query: string,
): Promise<LinkTarget[]> {
  try {
    const map = await getBattleMap(mapId);
    if (!map || !["player_character", "npc", "monster"].includes(kind))
      return [];
    return await searchLinkTargets(kind, map.campaignId, String(query));
  } catch (e) {
    console.error("link search failed", e);
    return [];
  }
}

export type CombatCommand =
  | { type: "damage"; combatantId: string; amount: number }
  | { type: "heal"; combatantId: string; amount: number }
  | { type: "makeActive"; combatantId: string }
  | { type: "nextTurn" };

export async function mapCombatCommandAction(
  mapId: string,
  expectedVersion: number,
  command: CombatCommand,
): Promise<CombatInfoResult & { stale?: boolean }> {
  try {
    const map = await getBattleMap(mapId);
    if (!map?.combatId) return { ok: false, error: "No combat is attached." };
    const combatId = map.combatId;
    if (command.type === "damage")
      await applyDamageCommand({
        combatId,
        expectedVersion,
        combatantId: command.combatantId,
        amount: command.amount,
        adjustment: "none",
      });
    else if (command.type === "heal")
      await applyHealCommand({
        combatId,
        expectedVersion,
        combatantId: command.combatantId,
        amount: command.amount,
      });
    else if (command.type === "makeActive")
      await setActiveCombatant({
        combatId,
        expectedVersion,
        combatantId: command.combatantId,
      });
    else await advanceTurn({ combatId, expectedVersion, direction: "next" });
    return { ok: true, info: await infoFor(mapId) };
  } catch (e) {
    if (e instanceof CombatConflictError)
      return {
        ok: false,
        stale: true,
        error: "The combat changed elsewhere. Refreshed; try again.",
      };
    if (
      e instanceof InvalidCombatStateError ||
      e instanceof CombatantNotFoundError
    )
      return {
        ok: false,
        error:
          command.type === "makeActive" || command.type === "nextTurn"
            ? "Turns can only change once the combat is running. Start it in the combat tracker."
            : e.message,
      };
    if (e instanceof ZodError)
      return { ok: false, error: e.issues[0]?.message ?? "Invalid value" };
    console.error("map combat command failed", e);
    return { ok: false, error: "Could not update the combat." };
  }
}

export type PlayerMapResult =
  { ok: true; version: number; doc: MapDoc } | { ok: false };

/** The map exactly as players may see it; DM-only data never leaves the server. */
export async function getPlayerMapAction(id: string): Promise<PlayerMapResult> {
  try {
    const map = await getBattleMap(id);
    if (!map) return { ok: false };
    return { ok: true, version: map.version, doc: playerView(map.doc) };
  } catch {
    return { ok: false };
  }
}
