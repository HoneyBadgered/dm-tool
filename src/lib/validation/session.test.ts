import { describe, expect, it } from "vitest";
import { sessionInputSchema } from "./session";

describe("session input", () => {
  it("normalizes valid session fields", () => {
    expect(
      sessionInputSchema.parse({
        campaignId: "campaign-1",
        number: "3",
        title: "The Lost Archive",
        playedAt: "2026-10-16",
        notes: "The party found a map.",
      }),
    ).toMatchObject({
      campaignId: "campaign-1",
      number: 3,
      title: "The Lost Archive",
      notes: "The party found a map.",
      playedAt: expect.any(Date),
    });
  });

  it("rejects duplicate-invalid dates, missing campaign, and invalid session numbers", () => {
    expect(() =>
      sessionInputSchema.parse({
        campaignId: "",
        number: "0",
        playedAt: "2026-02-31",
      }),
    ).toThrow();
  });
});
