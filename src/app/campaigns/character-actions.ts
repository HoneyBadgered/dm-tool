"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { ABILITY_LABELS } from "@/lib/validation/character";
import {
  CharacterNotFoundError,
  createCharacter,
  deleteCharacter,
  updateCharacter,
} from "@/server/services/campaigns/characters";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

function text(formData: FormData, key: string): string | undefined {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? undefined : raw;
}

function int(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  return raw === undefined ? undefined : Number(raw);
}

function toInput(formData: FormData) {
  const scores = ABILITY_LABELS.flatMap((label) => {
    const value = int(formData, `ability-${label}`);
    return value === undefined ? [] : [{ label, value }];
  });
  return {
    name: text(formData, "name"),
    playerName: text(formData, "playerName"),
    race: text(formData, "race"),
    characterClass: text(formData, "characterClass"),
    level: int(formData, "level"),
    maxHp: int(formData, "maxHp"),
    armorClass: int(formData, "armorClass"),
    initiativeModifier: int(formData, "initiativeModifier") ?? 0,
    speed: text(formData, "speed"),
    passivePerception: int(formData, "passivePerception"),
    abilityScores: scores,
    notes: text(formData, "notes"),
    backstory: text(formData, "backstory"),
  };
}

async function run(
  campaignId: string,
  notice: string,
  op: () => Promise<unknown>,
) {
  let result = notice;
  try {
    await op();
  } catch (e) {
    if (
      e instanceof ZodError ||
      e instanceof CharacterNotFoundError ||
      e instanceof CampaignNotFoundError
    )
      result = "character-invalid";
    else throw e;
  }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}?notice=${result}`);
}

export async function createCharacterAction(
  campaignId: string,
  formData: FormData,
) {
  await run(campaignId, "character-saved", () =>
    createCharacter({ campaignId, ...toInput(formData) }),
  );
}

export async function updateCharacterAction(
  campaignId: string,
  characterId: string,
  formData: FormData,
) {
  await run(campaignId, "character-saved", () =>
    updateCharacter(characterId, toInput(formData)),
  );
}

export async function deleteCharacterAction(
  campaignId: string,
  characterId: string,
) {
  await run(campaignId, "character-deleted", () =>
    deleteCharacter(characterId),
  );
}
