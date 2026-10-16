import { describe, expect, it } from "vitest";
import { campaignIdSchema, campaignInputSchema } from "./campaign";

describe("campaignInputSchema", () => {
  it("trims and accepts a valid name", () => {
    expect(campaignInputSchema.parse({ name: "  Curse of Strahd " })).toEqual({
      name: "Curse of Strahd",
      description: null,
    });
  });

  it("normalizes blank description to null and trims", () => {
    expect(
      campaignInputSchema.parse({ name: "A", description: "   " }).description,
    ).toBeNull();
    expect(
      campaignInputSchema.parse({ name: "A", description: " hi " }).description,
    ).toBe("hi");
  });

  it("rejects an empty name", () => {
    expect(campaignInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects overlong name and description", () => {
    expect(
      campaignInputSchema.safeParse({ name: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({
        name: "ok",
        description: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe("campaignIdSchema", () => {
  it("rejects empty ids", () => {
    expect(campaignIdSchema.safeParse(" ").success).toBe(false);
  });
});
