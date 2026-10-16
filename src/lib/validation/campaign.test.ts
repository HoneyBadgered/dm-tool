import { describe, expect, it } from "vitest";
import { campaignInputSchema } from "./campaign";

describe("campaignInputSchema", () => {
  it("trims and accepts a valid name", () => {
    expect(campaignInputSchema.parse({ name: "  Curse of Strahd " })).toEqual({
      name: "Curse of Strahd",
    });
  });

  it("rejects an empty name", () => {
    expect(campaignInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});
