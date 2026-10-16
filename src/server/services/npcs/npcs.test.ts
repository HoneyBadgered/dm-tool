import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  NpcNotFoundError,
  createNpc,
  deleteNpc,
  getNpc,
  listNpcs,
  updateNpc,
  type NpcDb,
} from "./npcs";

const row = {
  id: "n1",
  campaignId: "c1",
  name: "Ireena",
  role: null,
  location: null,
  notes: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  campaign: { name: "Strahd" },
};
const dto = {
  id: "n1",
  campaignId: "c1",
  campaignName: "Strahd",
  name: "Ireena",
  role: null,
  location: null,
  notes: null,
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
  return { npc, campaign, db: { npc, campaign } as unknown as NpcDb };
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
    expect(npc.create.mock.calls[0][0].data).toEqual({
      campaignId: "c1",
      name: "Ireena",
      role: null,
      location: null,
      notes: null,
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

  it("updates and returns the npc", async () => {
    const { db, npc } = fakeDb();
    expect(await updateNpc("n1", { name: "New" }, db)).toEqual(dto);
    expect(npc.updateMany).toHaveBeenCalled();
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
