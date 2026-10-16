import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  type CampaignDb,
} from "./campaigns";

const row = {
  id: "c1",
  name: "Strahd",
  description: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function fakeDb(overrides: Record<string, unknown> = {}) {
  const campaign = {
    findMany: vi.fn().mockResolvedValue([row]),
    findFirst: vi.fn().mockResolvedValue(row),
    create: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
  return { campaign, db: { campaign } as unknown as CampaignDb };
}

describe("campaign service", () => {
  it("lists non-deleted campaigns", async () => {
    const { db, campaign } = fakeDb();
    expect(await listCampaigns(db)).toEqual([row]);
    expect(campaign.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
    });
  });

  it("gets a campaign or null", async () => {
    expect(await getCampaign("c1", fakeDb().db)).toEqual(row);
    const { db } = fakeDb({ findFirst: vi.fn().mockResolvedValue(null) });
    expect(await getCampaign("nope", db)).toBeNull();
  });

  it("creates with validated data", async () => {
    const { db, campaign } = fakeDb();
    await createCampaign({ name: "  Strahd " }, db);
    expect(campaign.create.mock.calls[0][0].data).toEqual({
      name: "Strahd",
      description: null,
    });
  });

  it("rejects invalid create input without hitting the db", async () => {
    const { db, campaign } = fakeDb();
    await expect(createCampaign({ name: "" }, db)).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(campaign.create).not.toHaveBeenCalled();
  });

  it("updates and returns the campaign", async () => {
    const { db, campaign } = fakeDb();
    expect(await updateCampaign("c1", { name: "New" }, db)).toEqual(row);
    expect(campaign.updateMany).toHaveBeenCalled();
  });

  it("update throws on invalid input and missing campaign", async () => {
    await expect(
      updateCampaign("c1", { name: " " }, fakeDb().db),
    ).rejects.toBeInstanceOf(ZodError);
    const { db } = fakeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(updateCampaign("x", { name: "A" }, db)).rejects.toBeInstanceOf(
      CampaignNotFoundError,
    );
  });

  it("soft deletes, and throws when missing", async () => {
    const { db, campaign } = fakeDb();
    await deleteCampaign("c1", db);
    expect(campaign.updateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
      Date,
    );
    const missing = fakeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(deleteCampaign("x", missing.db)).rejects.toBeInstanceOf(
      CampaignNotFoundError,
    );
    await expect(deleteCampaign("", db)).rejects.toBeInstanceOf(ZodError);
  });
});
