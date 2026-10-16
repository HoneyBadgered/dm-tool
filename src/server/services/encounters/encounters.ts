import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  canTransition,
  encounterCreateSchema,
  encounterIdSchema,
  encounterStatusSchema,
  encounterUpdateSchema,
  type EncounterStatusValue,
} from "@/lib/validation/encounter";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export { CampaignNotFoundError };

export type EncounterDto = {
  id: string;
  campaignId: string;
  campaignName: string;
  title: string;
  status: EncounterStatusValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class EncounterNotFoundError extends Error {
  constructor(id: string) {
    super(`Encounter not found: ${id}`);
    this.name = "EncounterNotFoundError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    readonly from: EncounterStatusValue,
    readonly to: EncounterStatusValue,
  ) {
    super(`Invalid encounter status transition: ${from} -> ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}

export type EncounterDb = Pick<PrismaClient, "encounter" | "campaign">;

const select = {
  id: true,
  campaignId: true,
  title: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  campaign: { select: { name: true } },
} as const;

type Row = Omit<EncounterDto, "campaignName"> & { campaign: { name: string } };

function toDto({ campaign, ...rest }: Row): EncounterDto {
  return { ...rest, campaignName: campaign.name };
}

// Encounters of soft-deleted campaigns are hidden too.
const alive = { deletedAt: null, campaign: { deletedAt: null } } as const;

export async function listEncounters(
  db: EncounterDb = getDb(),
): Promise<EncounterDto[]> {
  const rows = await db.encounter.findMany({
    where: alive,
    orderBy: { createdAt: "desc" },
    select,
  });
  return rows.map(toDto);
}

export async function getEncounter(
  id: string,
  db: EncounterDb = getDb(),
): Promise<EncounterDto | null> {
  const parsed = encounterIdSchema.parse(id);
  const row = await db.encounter.findFirst({
    where: { id: parsed, ...alive },
    select,
  });
  return row ? toDto(row) : null;
}

export async function createEncounter(
  input: unknown,
  db: EncounterDb = getDb(),
): Promise<EncounterDto> {
  const data = encounterCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: data.campaignId, deletedAt: null },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(data.campaignId);
  return toDto(
    await db.encounter.create({ data: { ...data, status: "planned" }, select }),
  );
}

/** Updates title/notes only; status changes go through transitionEncounter. */
export async function updateEncounter(
  id: string,
  input: unknown,
  db: EncounterDb = getDb(),
): Promise<EncounterDto> {
  const parsedId = encounterIdSchema.parse(id);
  const data = encounterUpdateSchema.parse(input);
  const result = await db.encounter.updateMany({
    where: { id: parsedId, ...alive },
    data,
  });
  if (result.count === 0) throw new EncounterNotFoundError(parsedId);
  const updated = await getEncounter(parsedId, db);
  if (!updated) throw new EncounterNotFoundError(parsedId);
  return updated;
}

export async function transitionEncounter(
  id: string,
  to: unknown,
  db: EncounterDb = getDb(),
): Promise<EncounterDto> {
  const parsedId = encounterIdSchema.parse(id);
  const target = encounterStatusSchema.parse(to);
  const current = await getEncounter(parsedId, db);
  if (!current) throw new EncounterNotFoundError(parsedId);
  if (!canTransition(current.status, target)) {
    throw new InvalidStatusTransitionError(current.status, target);
  }
  // Guard on the status we validated against so concurrent changes can't slip through.
  const result = await db.encounter.updateMany({
    where: { id: parsedId, status: current.status, ...alive },
    data: { status: target },
  });
  if (result.count === 0) {
    const latest = await getEncounter(parsedId, db);
    if (!latest) throw new EncounterNotFoundError(parsedId);
    throw new InvalidStatusTransitionError(latest.status, target);
  }
  const updated = await getEncounter(parsedId, db);
  if (!updated) throw new EncounterNotFoundError(parsedId);
  return updated;
}

/** Soft delete: sets deletedAt. */
export async function deleteEncounter(
  id: string,
  db: EncounterDb = getDb(),
): Promise<void> {
  const parsedId = encounterIdSchema.parse(id);
  const result = await db.encounter.updateMany({
    where: { id: parsedId, ...alive },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new EncounterNotFoundError(parsedId);
}
