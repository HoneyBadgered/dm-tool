import { describe, expect, it } from "vitest";
import { averageDice, parseDice, rollDice } from "./dice";

describe("parseDice", () => {
  it("parses plain, positive and negative modifiers", () => {
    expect(parseDice("3d6")).toEqual({ count: 3, sides: 6, modifier: 0 });
    expect(parseDice("2d8+4")).toEqual({ count: 2, sides: 8, modifier: 4 });
    expect(parseDice(" 1d4 - 1 ")).toEqual({
      count: 1,
      sides: 4,
      modifier: -1,
    });
  });

  it("rejects malformed and out-of-bounds expressions", () => {
    for (const bad of [
      "",
      "d6",
      "3d",
      "0d6",
      "101d6",
      "1d1",
      "1d1001",
      "1d6+",
      "abc",
      "1d6+1d4",
    ]) {
      expect(parseDice(bad)).toBeNull();
    }
  });
});

describe("rollDice", () => {
  it("is deterministic with an injected rng", () => {
    const values = [0, 0.5, 0.999];
    let i = 0;
    const roll = rollDice("3d6+2", () => values[i++]);
    expect(roll?.rolls).toEqual([1, 4, 6]);
    expect(roll?.total).toBe(13);
  });

  it("returns null for invalid input", () => {
    expect(rollDice("nope")).toBeNull();
  });

  it("stays within bounds", () => {
    for (let n = 0; n < 200; n++) {
      const roll = rollDice("2d6")!;
      expect(roll.total).toBeGreaterThanOrEqual(2);
      expect(roll.total).toBeLessThanOrEqual(12);
    }
  });
});

describe("averageDice", () => {
  it("rounds down like the source stat blocks", () => {
    expect(averageDice({ count: 3, sides: 6, modifier: 0 })).toBe(10);
    expect(averageDice({ count: 2, sides: 8, modifier: 2 })).toBe(11);
  });
});
