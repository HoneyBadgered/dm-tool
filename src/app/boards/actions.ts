"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";
import {
  BoardNotFoundError,
  createBoard,
  deleteBoard,
  renameBoard,
} from "@/server/services/story/boards";

const text = (f: FormData, k: string) =>
  String(f.get(k) ?? "").trim() || undefined;

export async function createBoardAction(formData: FormData) {
  let target = "/boards?notice=invalid";
  try {
    const { id } = await createBoard({
      campaignId: text(formData, "campaignId"),
      name: text(formData, "name"),
    });
    target = `/boards/${id}`;
  } catch (e) {
    if (!(e instanceof ZodError || e instanceof CampaignNotFoundError)) throw e;
  }
  redirect(target);
}

export async function renameBoardAction(id: string, formData: FormData) {
  let notice = "renamed";
  try {
    await renameBoard(id, { name: text(formData, "name") });
  } catch (e) {
    if (!(e instanceof ZodError || e instanceof BoardNotFoundError)) throw e;
    notice = "invalid";
  }
  revalidatePath("/boards");
  redirect(`/boards/${id}?notice=${notice}`);
}

export async function deleteBoardAction(id: string) {
  let notice = "deleted";
  try {
    await deleteBoard(id);
  } catch (e) {
    if (!(e instanceof BoardNotFoundError)) throw e;
    notice = "invalid";
  }
  revalidatePath("/boards");
  redirect(`/boards?notice=${notice}`);
}
