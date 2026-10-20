"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";
import {
  StoryRecordNotFoundError,
  createRecord,
  deleteRecord,
  updateRecord,
} from "@/server/services/story/records";

function text(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? undefined : raw;
}

async function run(campaignId: string, ok: string, op: () => Promise<unknown>) {
  let notice = ok;
  try {
    await op();
  } catch (e) {
    if (
      e instanceof ZodError ||
      e instanceof StoryRecordNotFoundError ||
      e instanceof CampaignNotFoundError
    )
      notice = "record-invalid";
    else throw e;
  }
  revalidatePath(`/campaigns/${campaignId}/records`);
  redirect(`/campaigns/${campaignId}/records?notice=${notice}`);
}

const fields = (f: FormData) => ({
  kind: text(f, "kind"),
  name: text(f, "name"),
  summary: text(f, "summary"),
  dmNotes: text(f, "dmNotes"),
});

export async function createRecordAction(campaignId: string, f: FormData) {
  await run(campaignId, "record-saved", () =>
    createRecord({ campaignId, ...fields(f) }),
  );
}

export async function updateRecordAction(
  campaignId: string,
  id: string,
  f: FormData,
) {
  await run(campaignId, "record-saved", () => updateRecord(id, fields(f)));
}

export async function deleteRecordAction(campaignId: string, id: string) {
  await run(campaignId, "record-deleted", () => deleteRecord(id));
}
