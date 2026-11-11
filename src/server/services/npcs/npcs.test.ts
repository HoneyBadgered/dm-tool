import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  NpcNotFoundError,
  NpcReferenceNotFoundError,
  createNpc,
  deleteNpc,
  getNpc,
  listNpcs,
  updateNpc,
  updateNpcNotes,
  type NpcDb,
} from "./npcs";

const row = {
  id: "n1",
  campaignId: "c1",
  name: "Ireena",
  titleAlias: null,
  role: null,
  status: "active",
  race: null,
  characterClass: null,
  level: null,
  challengeRating: null,
  location: null,
  locationRecordId: null,
  locationRecord: null,
  faction: null,
  factionRecordId: null,
  factionRecord: null,
  quickSummary: null,
  appearance: null,
  personality: null,
  motivation: null,
  goals: null,
  currentPlans: null,
  fearWeakness: null,
  secret: null,
  knowledgeClues: null,
  voiceMannerisms: null,
  partyRelationship: null,
  notes: null,
  initiativeCombatNotes: null,
  backstory: null,
  dmNotes: null,
  relationshipNotes: null,
  statBlockReference: null,
  firstAppearance: null,
  lastSeen: null,
  portraitUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  campaign: { name: "Strahd" },
};
const dto = {
  id: "n1",
  campaignId: "c1",
  campaignName: "Strahd",
  name: "Ireena",
  titleAlias: null,
  role: null,
  status: "active",
  race: null,
  characterClass: null,
  level: null,
  challengeRating: null,
  location: null,
  locationRecordId: null,
  locationRecordName: null,
  faction: null,
  factionRecordId: null,
  factionRecordName: null,
  quickSummary: null,
  appearance: null,
  personality: null,
  motivation: null,
  goals: null,
  currentPlans: null,
  fearWeakness: null,
  secret: null,
  knowledgeClues: null,
  voiceMannerisms: null,
  partyRelationship: null,
  notes: null,
  initiativeCombatNotes: null,
  backstory: null,
  dmNotes: null,
  relationshipNotes: null,
  statBlockReference: null,
  firstAppearance: null,
  lastSeen: null,
  portraitUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function fakeDb(
  npcOverrides: Record<string, unknown> = {},
  campaignOverrides: Record<string, unknown> = {},
) {
  const npc = {
    findMany: vi.fn().mockResolvedValue([row]),
    findFirst: vi.fn().mockResolvedValue(row),
    create: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...npcOverrides,
  };
  const campaign = {
    findFirst: vi.fn().mockResolvedValue({ id: "c1" }),
    ...campaignOverrides,
  };
  const storyRecord = {
    findFirst: vi.fn().mockResolvedValue({ id: "r1" }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  return {
    npc,
    campaign,
    storyRecord,
    db: { npc, campaign, storyRecord } as unknown as NpcDb,
  };
}

describe("npc service", () => {
  it("lists live npcs with campaign name", async () => {
    const { db, npc } = fakeDb();
    expect(await listNpcs(db)).toEqual([dto]);
    expect(npc.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      campaign: { deletedAt: null },
    });
  });

  it("gets an npc or null; rejects empty id", async () => {
    expect(await getNpc("n1", fakeDb().db)).toEqual(dto);
    const { db } = fakeDb({ findFirst: vi.fn().mockResolvedValue(null) });
    expect(await getNpc("nope", db)).toBeNull();
    await expect(getNpc("", db)).rejects.toBeInstanceOf(ZodError);
  });

  it("creates with validated data", async () => {
    const { db, npc } = fakeDb();
    expect(await createNpc({ campaignId: "c1", name: " Ireena " }, db)).toEqual(
      dto,
    );
    expect(npc.create.mock.calls[0][0].data).toMatchObject({
      campaignId: "c1",
      name: "Ireena",
      titleAlias: null,
      status: "active",
      challengeRating: null,
      quickSummary: null,
      dmNotes: null,
    });
  });

  it("rejects invalid input without hitting the db", async () => {
    const { db, npc } = fakeDb();
    await expect(
      createNpc({ campaignId: "c1", name: "" }, db),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(createNpc({ name: "A" }, db)).rejects.toBeInstanceOf(ZodError);
    expect(npc.create).not.toHaveBeenCalled();
  });

  it("create throws for a bad or deleted campaign id", async () => {
    const { db, npc } = fakeDb(
      {},
      { findFirst: vi.fn().mockResolvedValue(null) },
    );
    await expect(
      createNpc({ campaignId: "bad", name: "A" }, db),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(npc.create).not.toHaveBeenCalled();
  });

  it("accepts only location and faction records from the same campaign", async () => {
    const { db, storyRecord, npc } = fakeDb();
    await createNpc(
      {
        campaignId: "c1",
        name: "Mira",
        locationRecordId: "r1",
        factionRecordId: "r2",
      },
      db,
    );
    expect(storyRecord.findFirst).toHaveBeenCalledTimes(2);
    expect(npc.create).toHaveBeenCalled();

    const invalid = fakeDb({
      create: vi.fn(),
    });
    invalid.storyRecord.findFirst.mockResolvedValue(null);
    await expect(
      createNpc(
        { campaignId: "c1", name: "Mira", locationRecordId: "other" },
        invalid.db,
      ),
    ).rejects.toBeInstanceOf(NpcReferenceNotFoundError);
    expect(invalid.npc.create).not.toHaveBeenCalled();
  });

  it("updates and returns the npc", async () => {
    const { db, npc } = fakeDb();
    expect(await updateNpc("n1", { name: "New" }, db)).toEqual(dto);
    expect(npc.updateMany).toHaveBeenCalled();
  });

  it("updates only notes and validates the NPC still exists", async () => {
    const { db, npc } = fakeDb();
    await updateNpcNotes("n1", { notes: "In-place note" }, db);
    expect(npc.updateMany).toHaveBeenCalledWith({
      where: {
        id: "n1",
        deletedAt: null,
        campaign: { deletedAt: null },
      },
      data: { notes: "In-place note" },
    });

    await expect(
      updateNpcNotes("n1", { notes: "x".repeat(5001) }, db),
    ).rejects.toBeInstanceOf(ZodError);
    const missing = fakeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(
      updateNpcNotes("missing", { notes: "x" }, missing.db),
    ).rejects.toBeInstanceOf(NpcNotFoundError);
  });

  it("update throws on invalid input and missing npc", async () => {
    await expect(
      updateNpc("n1", { name: " " }, fakeDb().db),
    ).rejects.toBeInstanceOf(ZodError);
    const { db } = fakeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(updateNpc("x", { name: "A" }, db)).rejects.toBeInstanceOf(
      NpcNotFoundError,
    );
  });

  it("soft deletes, and throws when missing", async () => {
    const { db, npc } = fakeDb();
    await deleteNpc("n1", db);
    expect(npc.updateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    const missing = fakeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(deleteNpc("x", missing.db)).rejects.toBeInstanceOf(
      NpcNotFoundError,
    );
    await expect(deleteNpc("", db)).rejects.toBeInstanceOf(ZodError);
  });
});
