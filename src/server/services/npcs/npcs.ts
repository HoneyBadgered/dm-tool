import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  npcCreateSchema,
  npcIdSchema,
  npcUpdateSchema,
} from "@/lib/validation/npc";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export { CampaignNotFoundError };

export type NpcDto = {
  id: string;
  campaignId: string;
  campaignName: string;
  name: string;
  role: string | null;
  location: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class NpcNotFoundError extends Error {
  constructor(id: string) {
    super(`NPC not found: ${id}`);
    this.name = "NpcNotFoundError";
  }
}

export type NpcDb = Pick<PrismaClient, "npc" | "campaign">;

const select = {
  id: true,
  campaignId: true,
  name: true,
  role: true,
  location: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  campaign: { select: { name: true } },
} as const;

type Row = Omit<NpcDto, "campaignName"> & { campaign: { name: string } };

function toDto({ campaign, ...rest }: Row): NpcDto {
  return { ...rest, campaignName: campaign.name };
}

// NPCs of soft-deleted campaigns are hidden too.
const alive = { deletedAt: null, campaign: { deletedAt: null } } as const;

export async function listNpcs(db: NpcDb = getDb()): Promise<NpcDto[]> {
  const rows = await db.npc.findMany({
    where: alive,
    orderBy: { createdAt: "desc" },
    select,
  });
  return rows.map(toDto);
}

export async function getNpc(
  id: string,
  db: NpcDb = getDb(),
): Promise<NpcDto | null> {
  const parsed = npcIdSchema.parse(id);
  const row = await db.npc.findFirst({
    where: { id: parsed, ...alive },
    select,
  });
  return row ? toDto(row) : null;
}

export async function createNpc(
  input: unknown,
  db: NpcDb = getDb(),
): Promise<NpcDto> {
  const data = npcCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: data.campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(data.campaignId);
  return toDto(await db.npc.create({ data, select }));
}

export async function updateNpc(
  id: string,
  input: unknown,
  db: NpcDb = getDb(),
): Promise<NpcDto> {
  const parsedId = npcIdSchema.parse(id);
  const data = npcUpdateSchema.parse(input);
  const result = await db.npc.updateMany({
    where: { id: parsedId, ...alive },
    data,
  });
  if (result.count === 0) throw new NpcNotFoundError(parsedId);
  const updated = await getNpc(parsedId, db);
  if (!updated) throw new NpcNotFoundError(parsedId);
  return updated;
}

/** Soft delete: sets deletedAt. */
export async function deleteNpc(
  id: string,
  db: NpcDb = getDb(),
): Promise<void> {
  const parsedId = npcIdSchema.parse(id);
  const result = await db.npc.updateMany({
    where: { id: parsedId, ...alive },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new NpcNotFoundError(parsedId);
}
