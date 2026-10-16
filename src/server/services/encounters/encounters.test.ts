import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  CampaignNotFoundError,
  EncounterNotFoundError,
  InvalidStatusTransitionError,
  createEncounter,
  deleteEncounter,
  getEncounter,
  listEncounters,
  transitionEncounter,
  updateEncounter,
  type EncounterDb,
} from "./encounters";
import {
  ENCOUNTER_STATUSES,
  canTransition,
  type EncounterStatusValue,
} from "@/lib/validation/encounter";

function makeRow(status: EncounterStatusValue = "planned") {
  return {
    id: "e1",
    campaignId: "c1",
    title: "Goblin ambush",
    status,
    notes: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    campaign: { name: "Strahd" },
  };
}

function fakeDb(
  status: EncounterStatusValue = "planned",
  encOverrides: Record<string, unknown> = {},
  campaignOverrides: Record<string, unknown> = {},
) {
  const encounter = {
    findMany: vi.fn().mockResolvedValue([makeRow(status)]),
    findFirst: vi.fn().mockResolvedValue(makeRow(status)),
    create: vi.fn().mockResolvedValue(makeRow(status)),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...encOverrides,
  };
  const campaign = {
    findFirst: vi.fn().mockResolvedValue({ id: "c1" }),
    ...campaignOverrides,
  };
  return {
    encounter,
    campaign,
    db: { encounter, campaign } as unknown as EncounterDb,
  };
}

describe("encounter transitions (pure)", () => {
  const allowed: [EncounterStatusValue, EncounterStatusValue][] = [
    ["planned", "active"],
    ["active", "resolved"],
    ["active", "planned"],
  ];
  it("allows only the defined transitions", () => {
    for (const from of ENCOUNTER_STATUSES) {
      for (const to of ENCOUNTER_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });
});

describe("encounter service", () => {
  it("lists live encounters with campaign name", async () => {
    const { db, encounter } = fakeDb();
    const [dto] = await listEncounters(db);
    expect(dto.campaignName).toBe("Strahd");
    expect(encounter.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      campaign: { deletedAt: null },
    });
  });

  it("gets an encounter or null; rejects empty id", async () => {
    expect((await getEncounter("e1", fakeDb().db))?.title).toBe(
      "Goblin ambush",
    );
    const { db } = fakeDb("planned", {
      findFirst: vi.fn().mockResolvedValue(null),
    });
    expect(await getEncounter("x", db)).toBeNull();
    await expect(getEncounter("", db)).rejects.toBeInstanceOf(ZodError);
  });

  it("creates as planned with validated data", async () => {
    const { db, encounter } = fakeDb();
    await createEncounter({ campaignId: "c1", title: " Ambush " }, db);
    expect(encounter.create.mock.calls[0][0].data).toEqual({
      campaignId: "c1",
      title: "Ambush",
      notes: null,
      status: "planned",
    });
  });

  it("create ignores a client-supplied status", async () => {
    const { db, encounter } = fakeDb();
    await createEncounter(
      { campaignId: "c1", title: "A", status: "resolved" },
      db,
    );
    expect(encounter.create.mock.calls[0][0].data.status).toBe("planned");
  });

  it("rejects invalid input and unknown campaign", async () => {
    const { db, encounter } = fakeDb();
    await expect(
      createEncounter({ campaignId: "c1", title: " " }, db),
    ).rejects.toBeInstanceOf(ZodError);
    expect(encounter.create).not.toHaveBeenCalled();
    const missing = fakeDb(
      "planned",
      {},
      { findFirst: vi.fn().mockResolvedValue(null) },
    );
    await expect(
      createEncounter({ campaignId: "bad", title: "A" }, missing.db),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it("updates title/notes only", async () => {
    const { db, encounter } = fakeDb();
    await updateEncounter("e1", { title: "New", status: "resolved" }, db);
    expect(encounter.updateMany.mock.calls[0][0].data).toEqual({
      title: "New",
      notes: null,
    });
  });

  it("update throws on invalid input and missing encounter", async () => {
    await expect(
      updateEncounter("e1", { title: "" }, fakeDb().db),
    ).rejects.toBeInstanceOf(ZodError);
    const { db } = fakeDb("planned", {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(
      updateEncounter("x", { title: "A" }, db),
    ).rejects.toBeInstanceOf(EncounterNotFoundError);
  });

  it("soft deletes, and throws when missing", async () => {
    const { db, encounter } = fakeDb();
    await deleteEncounter("e1", db);
    expect(encounter.updateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
      Date,
    );
    const missing = fakeDb("planned", {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(deleteEncounter("x", missing.db)).rejects.toBeInstanceOf(
      EncounterNotFoundError,
    );
  });
});

describe("transitionEncounter", () => {
  it.each([
    ["planned", "active"],
    ["active", "resolved"],
    ["active", "planned"],
  ] as const)("%s -> %s succeeds", async (from, to) => {
    const { db, encounter } = fakeDb(from);
    await transitionEncounter("e1", to, db);
    const call = encounter.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ status: to });
    expect(call.where.status).toBe(from);
  });

  it.each([
    ["planned", "resolved"],
    ["planned", "planned"],
    ["active", "active"],
    ["resolved", "planned"],
    ["resolved", "active"],
    ["resolved", "resolved"],
  ] as const)("%s -> %s is rejected", async (from, to) => {
    const { db, encounter } = fakeDb(from);
    await expect(transitionEncounter("e1", to, db)).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
    expect(encounter.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unknown status values and empty ids", async () => {
    const { db } = fakeDb();
    await expect(transitionEncounter("e1", "bogus", db)).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(transitionEncounter("", "active", db)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("throws not found when encounter is missing", async () => {
    const { db } = fakeDb("planned", {
      findFirst: vi.fn().mockResolvedValue(null),
    });
    await expect(transitionEncounter("x", "active", db)).rejects.toBeInstanceOf(
      EncounterNotFoundError,
    );
  });

  it("reports an invalid transition when status changed concurrently", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(makeRow("planned"))
      .mockResolvedValueOnce(makeRow("resolved"));
    const { db } = fakeDb("planned", {
      findFirst,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(
      transitionEncounter("e1", "active", db),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });
});
