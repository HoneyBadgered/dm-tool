import { describe, expect, it } from "vitest";
import {
  addCombatant,
  applyHpDelta,
  emptyCombat,
  nextTurn,
  numberedNames,
  parseBulkName,
  parseHpDelta,
  previousTurn,
  removeCombatant,
  toggleCondition,
  type Combatant,
} from "./combat";

const mk = (id: string, initiative: number, hp = 10): Combatant => ({
  id,
  name: id,
  initiative,
  hp,
  maxHp: 10,
  conditions: [],
});

describe("initiative and turns", () => {
  it("sorts descending and keeps active combatant when adding", () => {
    let s = addCombatant(emptyCombat, mk("a", 10));
    s = addCombatant(s, mk("b", 5));
    s = nextTurn(s);
    expect(s.combatants[s.turnIndex].id).toBe("b");
    s = addCombatant(s, mk("c", 20));
    expect(s.combatants.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(s.combatants[s.turnIndex].id).toBe("b");
  });

  it("increments round on wrap and can step back", () => {
    let s = addCombatant(addCombatant(emptyCombat, mk("a", 2)), mk("b", 1));
    s = nextTurn(nextTurn(s));
    expect(s).toMatchObject({ turnIndex: 0, round: 2 });
    s = previousTurn(s);
    expect(s).toMatchObject({ turnIndex: 1, round: 1 });
    expect(previousTurn({ ...s, turnIndex: 0 })).toMatchObject({ round: 1 });
  });

  it("adjusts turn when removing earlier combatant", () => {
    let s = addCombatant(
      addCombatant(addCombatant(emptyCombat, mk("a", 3)), mk("b", 2)),
      mk("c", 1),
    );
    s = nextTurn(nextTurn(s));
    s = removeCombatant(s, "a");
    expect(s.combatants[s.turnIndex].id).toBe("c");
  });

  it("handles empty state", () => {
    expect(nextTurn(emptyCombat)).toBe(emptyCombat);
  });
});

describe("hp", () => {
  it("parses deltas", () => {
    expect(parseHpDelta("-7")).toBe(-7);
    expect(parseHpDelta("+5")).toBe(5);
    expect(parseHpDelta("7")).toBe(-7);
    expect(parseHpDelta("abc")).toBeNull();
  });

  it("clamps between 0 and max", () => {
    expect(applyHpDelta(mk("a", 1, 4), -9).hp).toBe(0);
    expect(applyHpDelta(mk("a", 1, 4), 20).hp).toBe(10);
  });
});

describe("conditions and bulk", () => {
  it("toggles conditions", () => {
    const c = toggleCondition(mk("a", 1), "Prone");
    expect(c.conditions).toEqual(["Prone"]);
    expect(toggleCondition(c, "Prone").conditions).toEqual([]);
  });

  it("parses bulk names", () => {
    expect(parseBulkName("3 goblins")).toEqual({ name: "goblin", count: 3 });
    expect(parseBulkName("Ogre")).toEqual({ name: "Ogre", count: 1 });
    expect(parseBulkName("0 orcs")).toBeNull();
    expect(numberedNames("goblin", 2)).toEqual(["goblin 1", "goblin 2"]);
    expect(numberedNames("Ogre", 1)).toEqual(["Ogre"]);
  });
});
