"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  NpcNotFoundError,
  createNpc,
  deleteNpc,
  updateNpc,
} from "@/server/services/npcs/npcs";

export type FormState = { error: string | null };

function toInput(formData: FormData) {
  return {
    campaignId: formData.get("campaignId") ?? undefined,
    name: formData.get("name"),
    role: formData.get("role") ?? undefined,
    location: formData.get("location") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(", ");
  if (e instanceof CampaignNotFoundError) return "Campaign not found.";
  if (e instanceof NpcNotFoundError) return "NPC not found.";
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
