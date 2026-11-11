import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  npcCreateSchema,
  npcIdSchema,
  npcNotesUpdateSchema,
  npcUpdateSchema,
} from "@/lib/validation/npc";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export { CampaignNotFoundError };

export type NpcDto = {
  id: string;
  campaignId: string;
  campaignName: string;
  name: string;
  titleAlias: string | null;
  role: string | null;
  status: string;
  race: string | null;
  characterClass: string | null;
  level: number | null;
  challengeRating: string | null;
  location: string | null;
  locationRecordId: string | null;
  locationRecordName: string | null;
  faction: string | null;
  factionRecordId: string | null;
  factionRecordName: string | null;
  quickSummary: string | null;
  appearance: string | null;
  personality: string | null;
  motivation: string | null;
  goals: string | null;
  currentPlans: string | null;
  fearWeakness: string | null;
  secret: string | null;
  knowledgeClues: string | null;
  voiceMannerisms: string | null;
  partyRelationship: string | null;
  notes: string | null;
  initiativeCombatNotes: string | null;
  backstory: string | null;
  dmNotes: string | null;
  relationshipNotes: string | null;
  statBlockReference: string | null;
  firstAppearance: string | null;
  lastSeen: string | null;
  portraitUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class NpcNotFoundError extends Error {
  constructor(id: string) {
    super(`NPC not found: ${id}`);
    this.name = "NpcNotFoundError";
  }
}

export class NpcReferenceNotFoundError extends Error {
  readonly field: "location" | "faction";

  constructor(field: "location" | "faction") {
    super(`NPC ${field} reference not found in this campaign`);
    this.name = "NpcReferenceNotFoundError";
    this.field = field;
  }
}

export type NpcDb = Pick<PrismaClient, "npc" | "campaign" | "storyRecord">;

export type NpcRecordOption = {
  id: string;
  campaignId: string;
  kind: "location" | "faction";
  name: string;
};

const select = {
  id: true,
  campaignId: true,
  name: true,
  titleAlias: true,
  role: true,
  status: true,
  race: true,
  characterClass: true,
  level: true,
  challengeRating: true,
  location: true,
  locationRecordId: true,
  locationRecord: { select: { name: true } },
  faction: true,
  factionRecordId: true,
  factionRecord: { select: { name: true } },
  quickSummary: true,
  appearance: true,
  personality: true,
  motivation: true,
  goals: true,
  currentPlans: true,
  fearWeakness: true,
  secret: true,
  knowledgeClues: true,
  voiceMannerisms: true,
  partyRelationship: true,
  notes: true,
  initiativeCombatNotes: true,
  backstory: true,
  dmNotes: true,
  relationshipNotes: true,
  statBlockReference: true,
  firstAppearance: true,
  lastSeen: true,
  portraitUrl: true,
  createdAt: true,
  updatedAt: true,
  campaign: { select: { name: true } },
} as const;

type Row = Omit<
  NpcDto,
  "campaignName" | "locationRecordName" | "factionRecordName"
> & {
  campaign: { name: string };
  locationRecord: { name: string } | null;
  factionRecord: { name: string } | null;
};

function toDto({
  campaign,
  locationRecord,
  factionRecord,
  ...rest
}: Row): NpcDto {
  return {
    ...rest,
    campaignName: campaign.name,
    location: locationRecord?.name ?? rest.location,
    locationRecordName: locationRecord?.name ?? null,
    factionRecordName: factionRecord?.name ?? null,
    faction: factionRecord?.name ?? rest.faction,
  };
}

// NPCs of soft-deleted campaigns are hidden too.
const alive = { deletedAt: null, campaign: { deletedAt: null } } as const;

export async function listNpcRecordOptions(
  campaignIds: string[],
  db: NpcDb = getDb(),
): Promise<NpcRecordOption[]> {
  const records = await db.storyRecord.findMany({
    where: {
      campaignId: { in: campaignIds },
      deletedAt: null,
      kind: { in: ["location", "faction"] },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, campaignId: true, kind: true, name: true },
  });
  return records.flatMap((record) => {
    if (record.kind !== "location" && record.kind !== "faction") return [];
    return [{ ...record, kind: record.kind }];
  });
}

async function validateReferences(
  campaignId: string,
  data: { locationRecordId?: string | null; factionRecordId?: string | null },
  db: NpcDb,
) {
  for (const [field, id, kind] of [
    ["location", data.locationRecordId, "location"],
    ["faction", data.factionRecordId, "faction"],
  ] as const) {
    if (!id) continue;
    const record = await db.storyRecord.findFirst({
      where: { id, campaignId, kind, deletedAt: null },
      select: { id: true },
    });
    if (!record) throw new NpcReferenceNotFoundError(field);
  }
}

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
  await validateReferences(data.campaignId, data, db);
  return toDto(await db.npc.create({ data, select }));
}

export async function updateNpc(
  id: string,
  input: unknown,
  db: NpcDb = getDb(),
): Promise<NpcDto> {
  const parsedId = npcIdSchema.parse(id);
  const data = npcUpdateSchema.parse(input);
  const current = await db.npc.findFirst({
    where: { id: parsedId, ...alive },
    select: { campaignId: true },
  });
  if (!current) throw new NpcNotFoundError(parsedId);
  await validateReferences(current.campaignId, data, db);
  const result = await db.npc.updateMany({
    where: { id: parsedId, ...alive },
    data,
  });
  if (result.count === 0) throw new NpcNotFoundError(parsedId);
  const updated = await getNpc(parsedId, db);
  if (!updated) throw new NpcNotFoundError(parsedId);
  return updated;
}

export async function updateNpcNotes(
  id: string,
  input: unknown,
  db: NpcDb = getDb(),
): Promise<void> {
  const parsedId = npcIdSchema.parse(id);
  const { notes } = npcNotesUpdateSchema.parse(input);
  const result = await db.npc.updateMany({
    where: { id: parsedId, ...alive },
    data: { notes },
  });
  if (result.count === 0) throw new NpcNotFoundError(parsedId);
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
