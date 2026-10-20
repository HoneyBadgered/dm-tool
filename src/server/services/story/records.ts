import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  idSchema,
  recordCreateSchema,
  recordUpdateSchema,
  type RecordKind,
} from "@/lib/validation/board";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export class StoryRecordNotFoundError extends Error {
  constructor(id: string) {
    super(`Story record not found: ${id}`);
    this.name = "StoryRecordNotFoundError";
  }
}

export type StoryRecordDto = {
  id: string;
  campaignId: string;
  kind: RecordKind;
  name: string;
  summary: string | null;
  dmNotes: string | null;
  updatedAt: Date;
};

export type RecordDb = Pick<PrismaClient, "storyRecord" | "campaign">;

const select = {
  id: true,
  campaignId: true,
  kind: true,
  name: true,
  summary: true,
  dmNotes: true,
  updatedAt: true,
} as const;

export async function listRecords(
  campaignId: string,
  kind?: RecordKind,
  db: RecordDb = getDb(),
): Promise<StoryRecordDto[]> {
  return db.storyRecord.findMany({
    where: { campaignId, deletedAt: null, ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select,
  });
}

export async function getRecord(
  id: string,
  db: RecordDb = getDb(),
): Promise<StoryRecordDto | null> {
  return db.storyRecord.findFirst({
    where: { id: idSchema.parse(id), deletedAt: null },
    select,
  });
}

export async function createRecord(
  input: unknown,
  db: RecordDb = getDb(),
): Promise<StoryRecordDto> {
  const { campaignId, ...data } = recordCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(campaignId);
  return db.storyRecord.create({ data: { campaignId, ...data }, select });
}

export async function updateRecord(
  id: string,
  input: unknown,
  db: RecordDb = getDb(),
): Promise<StoryRecordDto> {
  const parsedId = idSchema.parse(id);
  const data = recordUpdateSchema.parse(input);
  const result = await db.storyRecord.updateMany({
    where: { id: parsedId, deletedAt: null },
    data,
  });
  if (result.count === 0) throw new StoryRecordNotFoundError(parsedId);
  const updated = await getRecord(parsedId, db);
  if (!updated) throw new StoryRecordNotFoundError(parsedId);
  return updated;
}

/** Soft delete. Board cards that point at it show as a missing record. */
export async function deleteRecord(
  id: string,
  db: RecordDb = getDb(),
): Promise<void> {
  const parsedId = idSchema.parse(id);
  const result = await db.storyRecord.updateMany({
    where: { id: parsedId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new StoryRecordNotFoundError(parsedId);
}
