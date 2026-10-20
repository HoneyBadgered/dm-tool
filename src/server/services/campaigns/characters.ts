import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  characterCreateSchema,
  characterIdSchema,
  characterUpdateSchema,
  type CharacterInput,
} from "@/lib/validation/character";
import { CampaignNotFoundError } from "./campaigns";

export class CharacterNotFoundError extends Error {
  constructor(id: string) {
    super(`Player character not found: ${id}`);
    this.name = "CharacterNotFoundError";
  }
}

export type CharacterDb = Pick<PrismaClient, "playerCharacter" | "campaign">;

export type CharacterDto = {
  id: string;
  campaignId: string;
  name: string;
  playerName: string | null;
  race: string | null;
  characterClass: string | null;
  level: number | null;
  maxHp: number;
  armorClass: number;
  initiativeModifier: number;
  speed: string | null;
  passivePerception: number | null;
  abilityScores: { label: string; value: number }[];
  notes: string | null;
  backstory: string | null;
};

const select = {
  id: true,
  campaignId: true,
  name: true,
  playerName: true,
  race: true,
  characterClass: true,
  level: true,
  maxHp: true,
  armorClass: true,
  initiativeModifier: true,
  speed: true,
  passivePerception: true,
  abilityScores: true,
  notes: true,
  backstory: true,
} as const;

type Row = Omit<CharacterDto, "abilityScores"> & { abilityScores: unknown };

function toDto(row: Row): CharacterDto {
  const scores = Array.isArray(row.abilityScores)
    ? (row.abilityScores as { label: string; value: number }[])
    : [];
  return { ...row, abilityScores: scores };
}

function toData(data: CharacterInput) {
  const { abilityScores, ...rest } = data;
  return { ...rest, abilityScores: abilityScores ?? Prisma.DbNull };
}

export async function listCharacters(
  campaignId: string,
  db: CharacterDb = getDb(),
): Promise<CharacterDto[]> {
  const rows = await db.playerCharacter.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select,
  });
  return rows.map(toDto);
}

export async function getCharacter(
  id: string,
  db: CharacterDb = getDb(),
): Promise<CharacterDto | null> {
  const row = await db.playerCharacter.findFirst({
    where: { id: characterIdSchema.parse(id), deletedAt: null },
    select,
  });
  return row ? toDto(row) : null;
}

export async function createCharacter(
  input: unknown,
  db: CharacterDb = getDb(),
): Promise<CharacterDto> {
  const { campaignId, ...data } = characterCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(campaignId);
  return toDto(
    await db.playerCharacter.create({
      data: { campaignId, ...toData(data) },
      select,
    }),
  );
}

/** Edits the library record only; running combats keep their own snapshots. */
export async function updateCharacter(
  id: string,
  input: unknown,
  db: CharacterDb = getDb(),
): Promise<CharacterDto> {
  const parsedId = characterIdSchema.parse(id);
  const data = characterUpdateSchema.parse(input);
  const result = await db.playerCharacter.updateMany({
    where: { id: parsedId, deletedAt: null },
    data: toData(data),
  });
  if (result.count === 0) throw new CharacterNotFoundError(parsedId);
  const updated = await getCharacter(parsedId, db);
  if (!updated) throw new CharacterNotFoundError(parsedId);
  return updated;
}

/** Soft delete: past combats and encounter history keep their references. */
export async function deleteCharacter(
  id: string,
  db: CharacterDb = getDb(),
): Promise<void> {
  const parsedId = characterIdSchema.parse(id);
  const result = await db.playerCharacter.updateMany({
    where: { id: parsedId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new CharacterNotFoundError(parsedId);
}
