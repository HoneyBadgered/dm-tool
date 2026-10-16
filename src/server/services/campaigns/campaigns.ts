import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  campaignIdSchema,
  campaignInputSchema,
} from "@/lib/validation/campaign";

export type CampaignDto = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class CampaignNotFoundError extends Error {
  constructor(id: string) {
    super(`Campaign not found: ${id}`);
    this.name = "CampaignNotFoundError";
  }
}

export type CampaignDb = Pick<PrismaClient, "campaign">;

const select = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listCampaigns(
  db: CampaignDb = getDb(),
): Promise<CampaignDto[]> {
  return db.campaign.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select,
  });
}

export async function getCampaign(
  id: string,
  db: CampaignDb = getDb(),
): Promise<CampaignDto | null> {
  const parsed = campaignIdSchema.parse(id);
  return db.campaign.findFirst({
    where: { id: parsed, deletedAt: null },
    select,
  });
}

export async function createCampaign(
  input: unknown,
  db: CampaignDb = getDb(),
): Promise<CampaignDto> {
  const data = campaignInputSchema.parse(input);
  return db.campaign.create({ data, select });
}

export async function updateCampaign(
  id: string,
  input: unknown,
  db: CampaignDb = getDb(),
): Promise<CampaignDto> {
  const parsedId = campaignIdSchema.parse(id);
  const data = campaignInputSchema.parse(input);
  const result = await db.campaign.updateMany({
    where: { id: parsedId, deletedAt: null },
    data,
  });
  if (result.count === 0) throw new CampaignNotFoundError(parsedId);
  const updated = await getCampaign(parsedId, db);
  if (!updated) throw new CampaignNotFoundError(parsedId);
  return updated;
}

/** Soft delete: sets deletedAt. */
export async function deleteCampaign(
  id: string,
  db: CampaignDb = getDb(),
): Promise<void> {
  const parsedId = campaignIdSchema.parse(id);
  const result = await db.campaign.updateMany({
    where: { id: parsedId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new CampaignNotFoundError(parsedId);
}
