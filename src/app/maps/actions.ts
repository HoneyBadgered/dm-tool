"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  BattleMapNotFoundError,
  CampaignNotFoundError,
  createBattleMap,
  deleteBattleMap,
  renameBattleMap,
} from "@/server/services/maps/battle-maps";

const text = (f: FormData, k: string) =>
  String(f.get(k) ?? "").trim() || undefined;

export async function createMapAction(formData: FormData) {
  let target = "/maps?notice=invalid";
  try {
    const overview = text(formData, "layout") === "overview";
    const { id } = await createBattleMap({
      campaignId: text(formData, "campaignId"),
      name: text(formData, "name"),
      cols: overview ? 100 : undefined,
      rows: overview ? 100 : undefined,
      cellSize: overview ? 20 : undefined,
    });
    target = `/maps/${id}`;
  } catch (e) {
    if (!(e instanceof ZodError || e instanceof CampaignNotFoundError)) throw e;
  }
  redirect(target);
}

export async function renameMapAction(id: string, formData: FormData) {
  let notice = "renamed";
  try {
    await renameBattleMap(id, text(formData, "name"));
  } catch (e) {
    if (!(e instanceof ZodError || e instanceof BattleMapNotFoundError))
      throw e;
    notice = "invalid";
  }
  revalidatePath("/maps");
  redirect(`/maps/${id}?notice=${notice}`);
}

export async function deleteMapAction(id: string) {
  let notice = "deleted";
  try {
    await deleteBattleMap(id);
  } catch (e) {
    if (!(e instanceof BattleMapNotFoundError)) throw e;
    notice = "invalid";
  }
  revalidatePath("/maps");
  redirect(`/maps?notice=${notice}`);
}
