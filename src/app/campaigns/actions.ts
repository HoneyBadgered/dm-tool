"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  createCampaign,
  deleteCampaign,
  updateCampaign,
} from "@/server/services/campaigns/campaigns";

export type FormState = { error: string | null };

function toInput(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  };
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(", ");
  if (e instanceof CampaignNotFoundError) return "Campaign not found.";
  throw e;
}

export async function createCampaignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    id = (await createCampaign(toInput(formData))).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/campaigns");
  redirect(`/campaigns/${id}`);
}

export async function updateCampaignAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateCampaign(id, toInput(formData));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  redirect(`/campaigns/${id}`);
}

export async function deleteCampaignAction(id: string): Promise<void> {
  try {
    await deleteCampaign(id);
  } catch (e) {
    if (!(e instanceof CampaignNotFoundError)) throw e;
  }
  revalidatePath("/campaigns");
  redirect("/campaigns");
}
