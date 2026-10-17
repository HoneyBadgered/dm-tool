import { describe, expect, it, vi } from "vitest";
import {
  createStorySession,
  listStorySessions,
  StoryCampaignNotFoundError,
  StorySessionConflictError,
  StorySessionNotFoundError,
  updateStorySession,
  type StoryDb,
} from "./story";

const storyRow = {
  id: "session-1",
  campaignId: "campaign-1",
  number: 1,
  title: "The Storm",
  notes: "The party reached the harbor.",
  isCurrent: false,
  playedAt: new Date("2026-10-15T12:00:00Z"),
  campaign: { name: "The Shattered Coast" },
};

function fakeDb() {
  const session = {
    findMany: vi.fn().mockResolvedValue([storyRow]),
    create: vi.fn().mockResolvedValue(storyRow),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const campaign = {
    findFirst: vi.fn().mockResolvedValue({ id: "campaign-1" }),
  };
  return {
    db: { session, campaign } as unknown as StoryDb,
    session,
    campaign,
  };
}

describe("story tracker service", () => {
  it("lists sessions in reverse chronological timeline order", async () => {
    const { db, session } = fakeDb();
    await expect(listStorySessions(db)).resolves.toEqual([
      {
        id: storyRow.id,
        campaignId: storyRow.campaignId,
        campaignName: "The Shattered Coast",
        number: 1,
        title: "The Storm",
        notes: "The party reached the harbor.",
        isCurrent: false,
        playedAt: storyRow.playedAt,
      },
    ]);
    expect(session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaign: { deletedAt: null } },
        orderBy: [
          { playedAt: "desc" },
          { campaignId: "asc" },
          { number: "desc" },
        ],
      }),
    );
  });

  it("creates sessions only for active campaigns", async () => {
    const { db, session, campaign } = fakeDb();
    session.findFirst.mockResolvedValueOnce(null);
    await expect(
      createStorySession(
        {
          campaignId: "campaign-1",
          number: "1",
          title: "The Storm",
          playedAt: "2026-10-15",
          notes: "The party reached the harbor.",
        },
        db,
      ),
    ).resolves.toMatchObject({
      id: "session-1",
      campaignName: "The Shattered Coast",
    });
    expect(campaign.findFirst).toHaveBeenCalledWith({
      where: { id: "campaign-1", deletedAt: null },
      select: { id: true },
    });
    expect(session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          campaignId: "campaign-1",
          number: 1,
          title: "The Storm",
          notes: "The party reached the harbor.",
          playedAt: expect.any(Date),
        },
      }),
    );
  });

  it("reports a missing campaign rather than creating an orphan session", async () => {
    const { db, session, campaign } = fakeDb();
    campaign.findFirst.mockResolvedValue(null);

    await expect(
      createStorySession({ campaignId: "missing", number: 1, notes: "" }, db),
    ).rejects.toBeInstanceOf(StoryCampaignNotFoundError);
    expect(session.create).not.toHaveBeenCalled();
  });

  it("updates sessions and reports deleted or hidden sessions explicitly", async () => {
    const { db, session } = fakeDb();
    session.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storyRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storyRow);
    await expect(
      updateStorySession(
        "session-1",
        {
          campaignId: "campaign-1",
          number: "2",
          title: "After the Storm",
          playedAt: "",
          notes: "The party left town.",
        },
        db,
      ),
    ).resolves.toMatchObject({ id: "session-1" });

    session.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateStorySession(
        "session-missing",
        { campaignId: "campaign-1", number: 2, notes: "" },
        db,
      ),
    ).rejects.toBeInstanceOf(StorySessionNotFoundError);
  });

  it("rejects duplicate session numbers within a campaign", async () => {
    const { db, session } = fakeDb();
    session.findFirst.mockResolvedValue({ id: "existing-session" });

    await expect(
      createStorySession(
        { campaignId: "campaign-1", number: 1, notes: "" },
        db,
      ),
    ).rejects.toBeInstanceOf(StorySessionConflictError);
    expect(session.create).not.toHaveBeenCalled();
  });
});
