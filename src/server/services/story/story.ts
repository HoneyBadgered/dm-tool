import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import { sessionIdSchema, sessionInputSchema } from "@/lib/validation/session";

export type StorySessionDto = {
  id: string;
  campaignId: string;
  campaignName: string;
  number: number;
  title: string | null;
  notes: string;
  isCurrent: boolean;
  playedAt: Date | null;
};

export type StoryDb = Pick<PrismaClient, "session" | "campaign">;

export class StorySessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Story session not found: ${id}`);
    this.name = "StorySessionNotFoundError";
  }
}

export class StoryCampaignNotFoundError extends Error {
  constructor(id: string) {
    super(`Campaign not found: ${id}`);
    this.name = "StoryCampaignNotFoundError";
  }
}

export class StorySessionConflictError extends Error {
  constructor(campaignId: string, number: number) {
    super(`Session ${number} already exists in campaign ${campaignId}`);
    this.name = "StorySessionConflictError";
  }
}

const select = {
  id: true,
  campaignId: true,
  number: true,
  title: true,
  notes: true,
  isCurrent: true,
  playedAt: true,
  campaign: { select: { name: true } },
} as const;

type StoryRow = Omit<StorySessionDto, "campaignName"> & {
  campaign: { name: string };
};

function toDto({ campaign, ...session }: StoryRow): StorySessionDto {
  return { ...session, campaignName: campaign.name };
}

export async function listStorySessions(
  db: StoryDb = getDb(),
): Promise<StorySessionDto[]> {
  const rows = await db.session.findMany({
    where: { campaign: { deletedAt: null } },
    orderBy: [{ playedAt: "desc" }, { campaignId: "asc" }, { number: "desc" }],
    select,
  });
  return rows.map(toDto);
}

export async function createStorySession(
  input: unknown,
  db: StoryDb = getDb(),
): Promise<StorySessionDto> {
  const data = sessionInputSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: data.campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new StoryCampaignNotFoundError(data.campaignId);
  const duplicate = await db.session.findFirst({
    where: { campaignId: data.campaignId, number: data.number },
    select: { id: true },
  });
  if (duplicate) {
    throw new StorySessionConflictError(data.campaignId, data.number);
  }

  const session = await db.session.create({
    data: {
      campaignId: data.campaignId,
      number: data.number,
      title: data.title,
      notes: data.notes,
      playedAt: data.playedAt,
    },
    select,
  });
  return toDto(session);
}

export async function updateStorySession(
  id: string,
  input: unknown,
  db: StoryDb = getDb(),
): Promise<StorySessionDto> {
  const parsedId = sessionIdSchema.parse(id);
  const data = sessionInputSchema.parse(input);
  if (data.campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: data.campaignId, deletedAt: null },
      select: { id: true },
    });
    if (!campaign) throw new StoryCampaignNotFoundError(data.campaignId);
  }
  const duplicate = await db.session.findFirst({
    where: {
      campaignId: data.campaignId,
      number: data.number,
      id: { not: parsedId },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new StorySessionConflictError(data.campaignId, data.number);
  }

  const updated = await db.session.updateMany({
    where: { id: parsedId, campaign: { deletedAt: null } },
    data: {
      campaignId: data.campaignId,
      number: data.number,
      title: data.title,
      notes: data.notes,
      playedAt: data.playedAt,
    },
  });
  if (updated.count === 0) throw new StorySessionNotFoundError(parsedId);

  const row = await db.session.findFirst({
    where: { id: parsedId, campaign: { deletedAt: null } },
    select,
  });
  if (!row) throw new StorySessionNotFoundError(parsedId);
  return toDto(row);
}
