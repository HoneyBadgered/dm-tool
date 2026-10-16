"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  EncounterNotFoundError,
  InvalidStatusTransitionError,
  createEncounter,
  deleteEncounter,
  transitionEncounter,
  updateEncounter,
} from "@/server/services/encounters/encounters";

export type FormState = { error: string | null };

function toInput(formData: FormData) {
  return {
    campaignId: formData.get("campaignId") ?? undefined,
    title: formData.get("title"),
    notes: formData.get("notes") ?? undefined,
  };
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(", ");
  if (e instanceof CampaignNotFoundError) return "Campaign not found.";
  if (e instanceof EncounterNotFoundError) return "Encounter not found.";
  throw e;
}

export async function createEncounterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    id = (await createEncounter(toInput(formData))).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/encounters");
  redirect(`/encounters/${id}?notice=created`);
}

export async function updateEncounterAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateEncounter(id, toInput(formData));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/encounters");
  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}?notice=updated`);
}

async function transition(id: string, to: "active" | "resolved") {
  let notice: string = to === "active" ? "activated" : "resolved";
  try {
    await transitionEncounter(id, to);
  } catch (e) {
    if (e instanceof EncounterNotFoundError) {
      revalidatePath("/encounters");
      redirect("/encounters");
    }
    notice =
      e instanceof InvalidStatusTransitionError
        ? "invalid-transition"
        : "transition-failed";
  }
  revalidatePath("/encounters");
  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}?notice=${notice}`);
}

export async function setActiveAction(id: string): Promise<void> {
  await transition(id, "active");
}

export async function resolveAction(id: string): Promise<void> {
  await transition(id, "resolved");
}

export async function deleteEncounterAction(id: string): Promise<void> {
  try {
    await deleteEncounter(id);
  } catch (e) {
    if (!(e instanceof EncounterNotFoundError)) {
      redirect(`/encounters/${id}?notice=delete-failed`);
    }
  }
  revalidatePath("/encounters");
  redirect("/encounters?notice=deleted");
}
