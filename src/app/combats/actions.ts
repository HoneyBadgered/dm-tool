"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  CombatConflictError,
  CombatNotFoundError,
  InvalidCombatStateError,
  addCombatant,
  addWave,
  advanceTurn,
  applyDamageCommand,
  applyHealCommand,
  NothingToUndoError,
  UndoConflictError,
  setCurrentHp,
  setMaxHp,
  setTempHp,
  undoLast,
  endCombat,
  moveInitiative,
  removeCombatant,
  restoreCombatant,
  rollInitiative,
  setActiveCombatant,
  setCombatStatus,
  setDefeated,
  setInitiative,
  setVisibility,
  addEffect,
  removeEffect,
  updateEffect,
} from "@/server/services/combat/live-combat";
import { COMBAT_SIDES } from "@/lib/validation/combat";

function go(combatId: string, notice: string, selected?: string): never {
  revalidatePath(`/combats/${combatId}`);
  const query = new URLSearchParams({ notice });
  if (selected) query.set("selected", selected);
  redirect(`/combats/${combatId}?${query}`);
}

async function run(
  combatId: string,
  notice: string,
  op: () => Promise<unknown>,
  selected?: string,
) {
  try {
    await op();
  } catch (e) {
    if (e instanceof CombatNotFoundError) redirect("/encounters");
    if (e instanceof CombatConflictError) go(combatId, "stale", selected);
    if (e instanceof UndoConflictError) go(combatId, "undo-conflict", selected);
    if (e instanceof NothingToUndoError)
      go(combatId, "nothing-to-undo", selected);
    if (e instanceof InvalidCombatStateError) go(combatId, "invalid", selected);
    if (e instanceof ZodError) go(combatId, "invalid", selected);
    throw e;
  }
  go(combatId, notice, selected);
}

export async function startCombatAction(
  combatId: string,
  expectedVersion: number,
  allowMissingInitiative: boolean,
) {
  await run(combatId, "started", () =>
    setCombatStatus({
      combatId,
      expectedVersion,
      to: "running",
      allowMissingInitiative,
    }),
  );
}

export async function pauseResumeAction(
  combatId: string,
  expectedVersion: number,
  to: "running" | "paused",
) {
  await run(combatId, to === "paused" ? "paused" : "resumed", () =>
    setCombatStatus({ combatId, expectedVersion, to }),
  );
}

export async function turnAction(
  combatId: string,
  expectedVersion: number,
  direction: "next" | "previous",
  selected?: string,
) {
  await run(
    combatId,
    "turn",
    () => advanceTurn({ combatId, expectedVersion, direction }),
    selected,
  );
}

export async function selectTurnAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
) {
  await run(
    combatId,
    "turn",
    () => setActiveCombatant({ combatId, expectedVersion, combatantId }),
    combatantId,
  );
}

export async function rollInitiativeAction(
  combatId: string,
  expectedVersion: number,
  combatantIds: string[],
  overwrite: boolean,
  selected?: string,
) {
  await run(
    combatId,
    "rolled",
    () =>
      rollInitiative({ combatId, expectedVersion, combatantIds, overwrite }),
    selected,
  );
}

export async function setInitiativeAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  formData: FormData,
) {
  const raw = String(formData.get("initiative") ?? "").trim();
  const tie = String(formData.get("tieBreak") ?? "").trim();
  await run(
    combatId,
    "initiative",
    () =>
      setInitiative({
        combatId,
        expectedVersion,
        combatantId,
        initiative: raw === "" ? null : Number(raw),
        ...(tie === "" ? {} : { tieBreak: Number(tie) }),
      }),
    combatantId,
  );
}

export async function moveInitiativeAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  direction: "up" | "down",
) {
  await run(
    combatId,
    "initiative",
    () => moveInitiative({ combatId, expectedVersion, combatantId, direction }),
    combatantId,
  );
}

export async function defeatAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  defeated: boolean,
) {
  await run(
    combatId,
    defeated ? "defeated" : "returned",
    () => setDefeated({ combatId, expectedVersion, combatantId, defeated }),
    combatantId,
  );
}

export async function visibilityAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  isHidden: boolean,
) {
  await run(
    combatId,
    isHidden ? "hidden" : "revealed",
    () => setVisibility({ combatId, expectedVersion, combatantId, isHidden }),
    combatantId,
  );
}

export async function removeCombatantAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
) {
  await run(combatId, "removed", () =>
    removeCombatant({ combatId, expectedVersion, combatantId }),
  );
}

export async function restoreCombatantAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
) {
  await run(
    combatId,
    "restored",
    () => restoreCombatant({ combatId, expectedVersion, combatantId }),
    combatantId,
  );
}

export async function addWaveAction(
  combatId: string,
  expectedVersion: number,
  wave: number,
) {
  await run(combatId, "wave-added", () =>
    addWave({ combatId, expectedVersion, wave }),
  );
}

export async function addReinforcementAction(
  combatId: string,
  expectedVersion: number,
  formData: FormData,
) {
  const side = formData.get("side");
  await run(combatId, "reinforcement-added", () =>
    addCombatant({
      combatId,
      expectedVersion,
      name: formData.get("name"),
      side: (COMBAT_SIDES as readonly unknown[]).includes(side)
        ? side
        : "enemy",
      maxHp: Number(formData.get("maxHp")),
      armorClass: Number(formData.get("armorClass")),
    }),
  );
}

export async function endCombatAction(
  combatId: string,
  expectedVersion: number,
) {
  await run(combatId, "ended", () => endCombat({ combatId, expectedVersion }));
}

function intField(formData: FormData, name: string): number | undefined {
  const raw = String(formData.get(name) ?? "").trim();
  return raw === "" ? undefined : Number(raw);
}

function textField(formData: FormData, name: string): string | undefined {
  const raw = String(formData.get(name) ?? "").trim();
  return raw === "" ? undefined : raw;
}

export async function damageAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  formData: FormData,
) {
  await run(
    combatId,
    "damaged",
    () =>
      applyDamageCommand({
        combatId,
        expectedVersion,
        combatantId,
        amount: intField(formData, "amount"),
        damageType: textField(formData, "damageType"),
        adjustment: textField(formData, "adjustment") ?? "none",
        override: intField(formData, "override"),
        note: textField(formData, "note"),
      }),
    combatantId,
  );
}

export async function healAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  formData: FormData,
) {
  await run(
    combatId,
    "healed",
    () =>
      applyHealCommand({
        combatId,
        expectedVersion,
        combatantId,
        amount: intField(formData, "amount"),
        note: textField(formData, "note"),
      }),
    combatantId,
  );
}

export async function tempHpAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  formData: FormData,
) {
  const clear = formData.get("intent") === "clear";
  await run(
    combatId,
    "temp-hp",
    () =>
      setTempHp({
        combatId,
        expectedVersion,
        combatantId,
        value: clear ? 0 : intField(formData, "value"),
        mode: clear
          ? "replace"
          : (textField(formData, "mode") ?? "keep_higher"),
        note: textField(formData, "note"),
      }),
    combatantId,
  );
}

export async function setHpAction(
  combatId: string,
  expectedVersion: number,
  combatantId: string,
  formData: FormData,
) {
  const maxHp = intField(formData, "maxHp");
  await run(
    combatId,
    maxHp === undefined ? "hp-set" : "max-hp",
    () =>
      maxHp === undefined
        ? setCurrentHp({
            combatId,
            expectedVersion,
            combatantId,
            value: intField(formData, "value"),
            note: textField(formData, "note"),
          })
        : setMaxHp({ combatId, expectedVersion, combatantId, maxHp }),
    combatantId,
  );
}

export async function undoAction(
  combatId: string,
  expectedVersion: number,
  force: boolean,
  selected?: string,
) {
  await run(
    combatId,
    "undone",
    () => undoLast({ combatId, expectedVersion, force }),
    selected,
  );
}

function metadataFromForm(formData: FormData): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  const ability = textField(formData, "saveAbility");
  const dc = intField(formData, "saveDc");
  if (ability || dc !== undefined)
    meta.save = {
      ability,
      dc,
      timing: textField(formData, "saveTiming") ?? "end",
    };
  const remindAt = textField(formData, "remindAt");
  if (remindAt) meta.remindAt = remindAt;
  const dice = textField(formData, "damageDice");
  if (dice) meta.damageDice = dice;
  const type = textField(formData, "damageType");
  if (type) meta.damageType = type;
  return Object.keys(meta).length > 0 ? meta : null;
}

export async function addEffectAction(
  combatId: string,
  expectedVersion: number,
  targetId: string,
  formData: FormData,
) {
  const conditionIndex = textField(formData, "conditionIndex");
  const durationRounds = intField(formData, "durationRounds");
  await run(
    combatId,
    "effect-added",
    () =>
      addEffect({
        combatId,
        expectedVersion,
        targetId,
        sourceCombatantId: textField(formData, "sourceCombatantId"),
        kind: conditionIndex ? "condition" : textField(formData, "kind"),
        name: conditionIndex ? undefined : textField(formData, "name"),
        conditionIndex,
        note: textField(formData, "note"),
        concentration: formData.get("concentration") === "on",
        durationRounds,
        expiryTrigger:
          durationRounds === undefined
            ? "none"
            : (textField(formData, "expiryTrigger") ?? "none"),
        metadata: metadataFromForm(formData),
      }),
    targetId,
  );
}

export async function updateEffectAction(
  combatId: string,
  expectedVersion: number,
  targetId: string,
  effectId: string,
  formData: FormData,
) {
  const extend = intField(formData, "extendRounds");
  const absolute = intField(formData, "expiresAtRound");
  const editing = formData.has("edit");
  await run(
    combatId,
    "effect-updated",
    () =>
      updateEffect({
        combatId,
        expectedVersion,
        effectId,
        // Only the full edit form carries "edit"; the quick extend form leaves other fields alone.
        note: editing ? String(formData.get("note") ?? "") : undefined,
        concentration: editing
          ? formData.get("concentration") === "on"
          : undefined,
        ...(extend !== undefined
          ? { extendRounds: extend }
          : formData.has("expiresAtRound")
            ? {
                expiresAtRound: absolute ?? null,
                expiryTrigger: textField(formData, "expiryTrigger"),
              }
            : {}),
        ...(editing ? { metadata: metadataFromForm(formData) } : {}),
      }),
    targetId,
  );
}

export async function removeEffectAction(
  combatId: string,
  expectedVersion: number,
  targetId: string,
  effectId: string,
  resolution: "removed" | "resolved" | "expired",
) {
  await run(
    combatId,
    "effect-removed",
    () => removeEffect({ combatId, expectedVersion, effectId, resolution }),
    targetId,
  );
}
