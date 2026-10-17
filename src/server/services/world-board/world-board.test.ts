import { describe, expect, it, vi } from "vitest";
import { getWorldBoard, type WorldBoardDb } from "./world-board";

describe("world board", () => {
  it("lists active campaigns and their active people grouped by campaign", async () => {
    const campaigns = [
      {
        id: "campaign-1",
        name: "The Shattered Coast",
        description: "A coastal mystery.",
        npcs: [
          {
            id: "npc-1",
            name: "Mara",
            role: "Harbor Master",
            location: "Saltmarsh",
            notes: "Knows about the wreck.",
          },
        ],
      },
    ];
    const findMany = vi.fn().mockResolvedValue(campaigns);
    const db = { campaign: { findMany } } as unknown as WorldBoardDb;

    await expect(getWorldBoard("", db)).resolves.toEqual(campaigns);
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        npcs: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            location: true,
            notes: true,
          },
        },
      },
    });
  });

  it("filters matching NPCs and campaigns and bounds search input", async () => {
    const campaigns = [
      {
        id: "campaign-1",
        name: "The Shattered Coast",
        description: null,
        npcs: [
          {
            id: "npc-1",
            name: "Mara",
            role: "Harbor Master",
            location: "Saltmarsh",
            notes: null,
          },
          {
            id: "npc-2",
            name: "Old Finn",
            role: "Guide",
            location: "Grey Isle",
            notes: null,
          },
        ],
      },
    ];
    const findMany = vi.fn().mockResolvedValue(campaigns);
    const db = { campaign: { findMany } } as unknown as WorldBoardDb;

    await expect(getWorldBoard("saltmarsh", db)).resolves.toMatchObject([
      { npcs: [{ id: "npc-1" }] },
    ]);
    await expect(getWorldBoard("shattered coast", db)).resolves.toMatchObject([
      { npcs: [{ id: "npc-1" }, { id: "npc-2" }] },
    ]);
    await expect(getWorldBoard("x".repeat(101), db)).rejects.toThrow(
      "100 characters or fewer",
    );
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
