import { describe, expect, it, vi } from "vitest";
import {
  CreatureTemplateNotFoundError,
  chooseStartingHp,
  readSnapshot,
  resolveCreature,
} from "./creature-templates";

const snapshot = {
  schemaVersion: 1 as const,
  name: "Goblin",
  maxHp: 7,
  hpAverage: 7,
  hpRoll: "2d6",
  armorClass: 15,
};

describe("chooseStartingHp", () => {
  it("uses the average by default and the roll when asked", () => {
    const base = snapshot as never;
    expect(chooseStartingHp(base, "average", {})).toEqual({
      maxHp: 7,
      rolled: false,
    });
    expect(chooseStartingHp(base, "rolled", {}, () => 0.999)).toEqual({
      maxHp: 12,
      rolled: true,
    });
  });

  it("an explicit maxHp override or manual mode never rolls", () => {
    const base = { ...snapshot, maxHp: 30 } as never;
    expect(chooseStartingHp(base, "rolled", { maxHp: 30 })).toEqual({
      maxHp: 30,
      rolled: false,
    });
    expect(chooseStartingHp(base, "manual", {})).toEqual({
      maxHp: 30,
      rolled: false,
    });
  });
});

describe("readSnapshot", () => {
  it("returns null for unreadable data instead of throwing", () => {
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot({ nonsense: true })).toBeNull();
  });
});

describe("resolveCreature", () => {
  it("scopes NPC lookups to the campaign and never writes", async () => {
    const db = {
      npc: { findFirst: vi.fn().mockResolvedValue(null) },
      ruleEntry: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      playerCharacter: { findFirst: vi.fn() },
    };
    await expect(
      resolveCreature(
        {
          kind: "npc",
          npcId: "n1",
          ruleEntryId: null,
          playerCharacterId: null,
          label: "Guard",
          overrides: null,
        },
        "camp-1",
        db as never,
      ),
    ).rejects.toBeInstanceOf(CreatureTemplateNotFoundError);
    expect(db.npc.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: "camp-1",
          deletedAt: null,
        }),
      }),
    );
    expect(db.ruleEntry.update).not.toHaveBeenCalled();
    expect(db.ruleEntry.updateMany).not.toHaveBeenCalled();
  });
});
