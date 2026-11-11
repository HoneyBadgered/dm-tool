"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  NpcNotFoundError,
  NpcReferenceNotFoundError,
  createNpc,
  deleteNpc,
  updateNpc,
  updateNpcNotes,
} from "@/server/services/npcs/npcs";

export type FormState = { error: string | null };

function levelField(formData: FormData): number | undefined {
  const raw = String(formData.get("level") ?? "").trim();
  return raw === "" ? undefined : Number(raw);
}

function toInput(formData: FormData) {
  const textFields = [
    "titleAlias",
    "role",
    "status",
    "race",
    "characterClass",
    "challengeRating",
    "location",
    "locationRecordId",
    "faction",
    "factionRecordId",
    "quickSummary",
    "appearance",
    "personality",
    "motivation",
    "goals",
    "currentPlans",
    "fearWeakness",
    "secret",
    "knowledgeClues",
    "voiceMannerisms",
    "partyRelationship",
    "notes",
    "initiativeCombatNotes",
    "backstory",
    "dmNotes",
    "relationshipNotes",
    "statBlockReference",
    "firstAppearance",
    "lastSeen",
    "portraitUrl",
  ] as const;
  return {
    campaignId: formData.get("campaignId") ?? undefined,
    name: formData.get("name"),
    level: levelField(formData),
    ...Object.fromEntries(
      textFields.map((field) => [field, formData.get(field) ?? undefined]),
    ),
  };
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(", ");
  if (e instanceof CampaignNotFoundError) return "Campaign not found.";
  if (e instanceof NpcNotFoundError) return "NPC not found.";
  if (e instanceof NpcReferenceNotFoundError)
    return `The selected ${e.field} isn't available in this campaign.`;
  throw e;
}

export async function createNpcAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    id = (await createNpc(toInput(formData))).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/npcs");
  redirect(`/npcs/${id}?notice=created`);
}

export async function updateNpcAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateNpc(id, toInput(formData));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/npcs");
  revalidatePath(`/npcs/${id}`);
  redirect(`/npcs/${id}?notice=updated`);
}

export async function updateNpcNotesAction(
  id: string,
  formData: FormData,
): Promise<void> {
  try {
    await updateNpcNotes(id, { notes: formData.get("notes") });
  } catch (e) {
    if (e instanceof ZodError || e instanceof NpcNotFoundError) {
      redirect(`/npcs/${id}?notice=notes-save-failed`);
    }
    throw e;
  }
  revalidatePath("/npcs");
  revalidatePath(`/npcs/${id}`);
  redirect(`/npcs/${id}?notice=notes-updated`);
}

export async function deleteNpcAction(id: string): Promise<void> {
  try {
    await deleteNpc(id);
  } catch (e) {
    if (!(e instanceof NpcNotFoundError)) {
      redirect(`/npcs/${id}?notice=delete-failed`);
    }
  }
  revalidatePath("/npcs");
  redirect("/npcs?notice=deleted");
}
