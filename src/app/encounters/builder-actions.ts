"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { CREATURE_KINDS } from "@/lib/validation/combat";
import {
  CreatureTemplateNotFoundError,
  IncompleteCreatureError,
} from "@/server/services/combat/creature-templates";
import {
  DuplicatePlayerEntryError,
  EncounterEntryLimitError,
  EncounterEntryNotFoundError,
  addEncounterEntry,
  duplicateEncounterEntry,
  moveEncounterEntry,
  removeEncounterEntry,
  updateEncounterEntry,
} from "@/server/services/combat/encounter-entries";
import {
  EncounterHasOpenCombatError,
  deleteEncounterTemplate,
  duplicateEncounter,
} from "@/server/services/combat/encounter-builder";
import {
  EncounterInCombatError,
  InvalidCombatStateError,
  createCombatFromEncounter,
} from "@/server/services/combat/live-combat";
import { EncounterNotFoundError } from "@/server/services/encounters/encounters";
import { parseEntryPatch, parseNewEntry } from "./entry-form";
import type { FormState } from "./actions";

function describe(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(", ");
  if (e instanceof CreatureTemplateNotFoundError)
    return "A referenced creature no longer exists or is not part of this campaign.";
  if (
    e instanceof IncompleteCreatureError ||
    e instanceof EncounterEntryLimitError
  )
    return e.message;
  if (e instanceof DuplicatePlayerEntryError) return e.message;
  if (e instanceof EncounterEntryNotFoundError)
    return "That entry no longer exists. Refresh and try again.";
  if (e instanceof EncounterNotFoundError) redirect("/encounters");
  throw e;
}

function refresh(encounterId: string) {
  revalidatePath("/encounters");
  revalidatePath(`/encounters/${encounterId}`);
}

function back(encounterId: string, notice: string): never {
  refresh(encounterId);
  redirect(`/encounters/${encounterId}?notice=${notice}`);
}

export async function addEntryAction(
  encounterId: string,
  kind: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(CREATURE_KINDS as readonly string[]).includes(kind))
    return { error: "Unknown creature type." };
  try {
    await addEncounterEntry(
      encounterId,
      parseNewEntry(kind as (typeof CREATURE_KINDS)[number], formData),
    );
  } catch (e) {
    return { error: describe(e) };
  }
  back(encounterId, "entry-added");
}

export async function updateEntryAction(
  encounterId: string,
  entryId: string,
  kind: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(CREATURE_KINDS as readonly string[]).includes(kind))
    return { error: "Unknown creature type." };
  try {
    await updateEncounterEntry(
      entryId,
      parseEntryPatch(kind as (typeof CREATURE_KINDS)[number], formData),
    );
  } catch (e) {
    return { error: describe(e) };
  }
  back(encounterId, "entry-updated");
}

async function entryOperation(
  encounterId: string,
  operation: () => Promise<unknown>,
  notice: string,
): Promise<never> {
  try {
    await operation();
  } catch (e) {
    let message: string;
    try {
      message = describe(e);
    } catch {
      message = "";
    }
    refresh(encounterId);
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(message || "Could not complete that change.")}`,
    );
  }
  return back(encounterId, notice);
}

export async function removeEntryAction(encounterId: string, entryId: string) {
  await entryOperation(
    encounterId,
    () => removeEncounterEntry(entryId),
    "entry-removed",
  );
}

export async function duplicateEntryAction(
  encounterId: string,
  entryId: string,
) {
  await entryOperation(
    encounterId,
    () => duplicateEncounterEntry(entryId),
    "entry-duplicated",
  );
}

export async function moveEntryAction(
  encounterId: string,
  entryId: string,
  direction: "up" | "down",
) {
  await entryOperation(
    encounterId,
    () => moveEncounterEntry(entryId, direction),
    "entry-moved",
  );
}

export async function duplicateEncounterAction(encounterId: string) {
  let id: string;
  try {
    id = (await duplicateEncounter(encounterId)).id;
  } catch (e) {
    if (e instanceof EncounterNotFoundError) redirect("/encounters");
    throw e;
  }
  revalidatePath("/encounters");
  redirect(`/encounters/${id}?notice=duplicated`);
}

export async function launchCombatAction(encounterId: string) {
  let combatId: string;
  try {
    combatId = (await createCombatFromEncounter({ encounterId })).combatId;
  } catch (e) {
    if (e instanceof EncounterNotFoundError) redirect("/encounters");
    let notice = "launch-failed";
    if (e instanceof EncounterInCombatError) notice = "launch-open";
    else if (e instanceof InvalidCombatStateError) notice = "launch-empty";
    else if (e instanceof CreatureTemplateNotFoundError)
      notice = "launch-missing";
    else if (e instanceof IncompleteCreatureError) notice = "launch-incomplete";
    else if (!(e instanceof ZodError)) throw e;
    redirect(`/encounters/${encounterId}?notice=${notice}`);
  }
  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/combats/${combatId}?notice=launched`);
}

export async function deleteEncounterTemplateAction(encounterId: string) {
  try {
    await deleteEncounterTemplate(encounterId);
  } catch (e) {
    if (e instanceof EncounterHasOpenCombatError)
      redirect(`/encounters/${encounterId}?notice=delete-open-combat`);
    if (!(e instanceof EncounterNotFoundError))
      redirect(`/encounters/${encounterId}?notice=delete-failed`);
  }
  revalidatePath("/encounters");
  redirect("/encounters?notice=deleted");
}
