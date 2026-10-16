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

describe("campaignInputSchema edge cases", () => {
  it("accepts boundary lengths", () => {
    expect(
      campaignInputSchema.safeParse({
        name: "x".repeat(120),
        description: "y".repeat(2000),
      }).success,
    ).toBe(true);
  });

  it("reports friendly messages", () => {
    const r = campaignInputSchema.safeParse({ name: "" });
    expect(!r.success && r.error.issues[0]?.message).toBe("Name is required");
    const long = campaignInputSchema.safeParse({ name: "x".repeat(121) });
    expect(!long.success && long.error.issues[0]?.message).toBe(
      "Name must be at most 120 characters",
    );
  });

  it("rejects missing or non-string name", () => {
    expect(campaignInputSchema.safeParse({}).success).toBe(false);
    expect(campaignInputSchema.safeParse({ name: null }).success).toBe(false);
  });

  it("counts length after trimming", () => {
    expect(
      campaignInputSchema.safeParse({ name: ` ${"x".repeat(120)} ` }).success,
    ).toBe(true);
  });
});

describe("campaignIdSchema", () => {
  it("rejects empty ids", () => {
    expect(campaignIdSchema.safeParse(" ").success).toBe(false);
  });
});
