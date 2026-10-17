"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  createStorySession,
  StoryCampaignNotFoundError,
  StorySessionConflictError,
  StorySessionNotFoundError,
  updateStorySession,
} from "@/server/services/story/story";

function toInput(formData: FormData) {
  return {
    campaignId: formData.get("campaignId"),
    number: formData.get("number"),
    title: formData.get("title") ?? "",
    playedAt: formData.get("playedAt") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

function getNotice(error: unknown): string {
  if (error instanceof ZodError) return "invalid-input";
  if (error instanceof StoryCampaignNotFoundError) return "campaign-missing";
  if (error instanceof StorySessionConflictError) return "session-conflict";
  if (error instanceof StorySessionNotFoundError) return "session-missing";
  throw error;
}

export async function createStorySessionAction(formData: FormData) {
  try {
    await createStorySession(toInput(formData));
  } catch (error) {
    redirect(`/story?notice=${getNotice(error)}`);
  }
  revalidatePath("/story");
  revalidatePath("/campaigns");
  redirect("/story?notice=created");
}

export async function updateStorySessionAction(id: string, formData: FormData) {
  try {
    await updateStorySession(id, toInput(formData));
  } catch (error) {
    redirect(`/story?notice=${getNotice(error)}`);
  }
  revalidatePath("/story");
  revalidatePath("/campaigns");
  redirect("/story?notice=updated");
}
