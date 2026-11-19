import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CombatConflictError,
  InvalidCombatStateError,
  advanceTurn,
  setCombatStatus,
} from "@/server/services/combat/live-combat";
import { startCombatAction, turnAction } from "./actions";

const mocks = vi.hoisted(() => ({ getCombat: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/server/services/combat/live-combat", async (importOriginal) => ({
  ...(await importOriginal()),
  advanceTurn: vi.fn(),
  getCombat: mocks.getCombat,
  setCombatStatus: vi.fn(),
}));

describe("combat turn actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("opens the first combatant after starting", async () => {
    mocks.getCombat.mockResolvedValue({ activeCombatantId: "first" });

    await expect(startCombatAction("combat", 1, false)).rejects.toThrow(
      "redirect:/combats/combat?notice=started&selected=first",
    );
    expect(setCombatStatus).toHaveBeenCalledWith({
      combatId: "combat",
      expectedVersion: 1,
      to: "running",
      allowMissingInitiative: false,
    });
  });

  it.each(["next", "previous"] as const)(
    "opens the current combatant after moving %s, replacing an earlier selection",
    async (direction) => {
      mocks.getCombat.mockResolvedValue({ activeCombatantId: "current" });

      await expect(turnAction("combat", 2, direction, "other")).rejects.toThrow(
        "redirect:/combats/combat?notice=turn&selected=current",
      );
      expect(advanceTurn).toHaveBeenCalledWith({
        combatId: "combat",
        expectedVersion: 2,
        direction,
      });
    },
  );

  it("opens the current combatant when nothing was selected", async () => {
    mocks.getCombat.mockResolvedValue({ activeCombatantId: "current" });

    await expect(turnAction("combat", 2, "next")).rejects.toThrow(
      "redirect:/combats/combat?notice=turn&selected=current",
    );
  });

  it.each([
    [new CombatConflictError("combat", 2), "stale"],
    [new InvalidCombatStateError("Cannot advance"), "invalid"],
  ])("preserves the selection when a turn fails: %s", async (error, notice) => {
    vi.mocked(advanceTurn).mockRejectedValue(error);

    await expect(turnAction("combat", 2, "next", "other")).rejects.toThrow(
      `redirect:/combats/combat?notice=${notice}&selected=other`,
    );
    expect(mocks.getCombat).not.toHaveBeenCalled();
  });

  it("surfaces an error if the updated combat cannot be loaded", async () => {
    mocks.getCombat.mockRejectedValue(new Error("Database unavailable"));

    await expect(turnAction("combat", 2, "next")).rejects.toThrow(
      "Database unavailable",
    );
  });
});
