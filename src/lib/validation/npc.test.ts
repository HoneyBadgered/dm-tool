import { describe, expect, it } from "vitest";
import {
  NPC_NAME_MAX_LENGTH,
  npcCreateSchema,
  npcIdSchema,
  npcUpdateSchema,
} from "./npc";

describe("npc validation", () => {
  it("trims and normalizes optional fields to null", () => {
    expect(
      npcCreateSchema.parse({
        campaignId: " c1 ",
        name: "  Ireena ",
        role: "",
        notes: "  hi ",
      }),
    ).toEqual({
      campaignId: "c1",
      name: "Ireena",
      role: null,
      location: null,
      notes: "hi",
    });
  });

  it("requires name and campaignId", () => {
    expect(
      npcCreateSchema.safeParse({ campaignId: "c1", name: " " }).success,
    ).toBe(false);
    expect(
      npcCreateSchema.safeParse({ campaignId: "", name: "A" }).success,
    ).toBe(false);
    expect(npcUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("enforces max lengths", () => {
    expect(
      npcUpdateSchema.safeParse({ name: "x".repeat(NPC_NAME_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(
      npcUpdateSchema.safeParse({ name: "A", role: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("validates ids", () => {
    expect(npcIdSchema.safeParse("").success).toBe(false);
    expect(npcIdSchema.parse(" a ")).toBe("a");
  });
});
