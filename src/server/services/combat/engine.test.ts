import { describe, expect, it } from "vitest";
import type { Change } from "@/lib/validation/combat";
import {
  adjustDamage,
  suggestAdjustment,
  applyDamage,
  applyHeal,
  applyTempHp,
  effectReminders,
  findDueEffects,
  invertChanges,
  matchesExpected,
  nextTurn,
  numberedNames,
  orderCombatants,
  previousTurn,
  turnOrder,
  type CombatantState,
  type EffectState,
  type ReminderEffect,
} from "./engine";

function c(
  id: string,
  initiative: number | null,
  extra: Partial<CombatantState> = {},
): CombatantState {
  return {
    id,
    name: id,
    initiative,
    initiativeTieBreak: 0,
    currentHp: 10,
    maxHp: 10,
    tempHp: 0,
    armorClass: 12,
    status: "active",
    isHidden: false,
    ...extra,
  };
}

describe("orderCombatants", () => {
  it("sorts by initiative, then tie-break, then id; unrolled last", () => {
    const ordered = orderCombatants([
      c("d", null),
      c("b", 15, { initiativeTieBreak: 2 }),
      c("a", 15, { initiativeTieBreak: 1 }),
      c("c", 20),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("is stable for identical keys and does not mutate input", () => {
    const input = [c("z", 10), c("y", 10)];
    expect(orderCombatants(input).map((x) => x.id)).toEqual(["y", "z"]);
    expect(input.map((x) => x.id)).toEqual(["z", "y"]);
  });

  it("turnOrder drops defeated and removed", () => {
    const list = [
      c("a", 10),
      c("b", 9, { status: "defeated" }),
      c("c", 8, { status: "removed" }),
    ];
    expect(turnOrder(list).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("nextTurn / previousTurn", () => {
  const list = [c("a", 20), c("b", 10), c("c", 5)];

  it("advances and wraps into a new round", () => {
    expect(nextTurn({ round: 1, activeCombatantId: "a" }, list)).toEqual({
      round: 1,
      activeCombatantId: "b",
    });
    expect(nextTurn({ round: 1, activeCombatantId: "c" }, list)).toEqual({
      round: 2,
      activeCombatantId: "a",
    });
  });

  it("skips defeated combatants", () => {
    const withDefeated = [
      c("a", 20),
      c("b", 10, { status: "defeated" }),
      c("c", 5),
    ];
    expect(
      nextTurn({ round: 1, activeCombatantId: "a" }, withDefeated)
        ?.activeCombatantId,
    ).toBe("c");
  });

  it("moves on correctly when the pointer is on a defeated combatant", () => {
    const withDefeated = [
      c("a", 20),
      c("b", 10, { status: "defeated" }),
      c("c", 5),
    ];
    expect(
      nextTurn({ round: 1, activeCombatantId: "b" }, withDefeated)
        ?.activeCombatantId,
    ).toBe("c");
  });

  it("returns null when nobody is active", () => {
    expect(
      nextTurn({ round: 1, activeCombatantId: null }, [
        c("a", 1, { status: "defeated" }),
      ]),
    ).toBeNull();
  });

  it("goes back, wraps to the previous round, and stops at the start", () => {
    expect(
      previousTurn({ round: 1, activeCombatantId: "b" }, list)
        ?.activeCombatantId,
    ).toBe("a");
    expect(previousTurn({ round: 2, activeCombatantId: "a" }, list)).toEqual({
      round: 1,
      activeCombatantId: "c",
    });
    expect(previousTurn({ round: 1, activeCombatantId: "a" }, list)).toBeNull();
  });

  it("a combatant added with higher initiative does not steal the turn", () => {
    const added = [...list, c("new", 30)];
    // The pointer is an id, so the active combatant is unchanged; next from "a" is still "b".
    expect(
      nextTurn({ round: 1, activeCombatantId: "a" }, added)?.activeCombatantId,
    ).toBe("b");
  });
});

describe("HP math", () => {
  it("temp HP absorbs damage first and overkill is reported", () => {
    expect(applyDamage({ currentHp: 10, tempHp: 5 }, 8)).toEqual({
      currentHp: 7,
      tempHp: 0,
      absorbedByTemp: 5,
      appliedToHp: 3,
      overkill: 0,
    });
    expect(applyDamage({ currentHp: 4, tempHp: 0 }, 10)).toMatchObject({
      currentHp: 0,
      appliedToHp: 4,
      overkill: 6,
    });
    expect(applyDamage({ currentHp: 10, tempHp: 5 }, 3)).toMatchObject({
      currentHp: 10,
      tempHp: 2,
    });
  });

  it("healing caps at max HP and reports waste", () => {
    expect(applyHeal({ currentHp: 4, maxHp: 10 }, 20)).toEqual({
      currentHp: 10,
      healed: 6,
      wasted: 14,
    });
  });

  it("temp HP replace vs keep higher", () => {
    expect(applyTempHp(5, 3, "keep_higher")).toBe(5);
    expect(applyTempHp(5, 3, "replace")).toBe(3);
    expect(applyTempHp(2, 9, "keep_higher")).toBe(9);
  });
});

describe("findDueEffects", () => {
  const effect = (over: Partial<EffectState>): EffectState => ({
    id: "e",
    targetId: "t",
    sourceCombatantId: "s",
    name: "Effect",
    isActive: true,
    expiresAtRound: 3,
    expiryTrigger: "end_of_target_turn",
    ...over,
  });

  it("fires at the end of the target's turn once the round is reached", () => {
    const e = effect({});
    const ctx = (round: number, prev: string | null, prevRound = round) => ({
      round,
      activeCombatantId: "x",
      previous: prev ? { round: prevRound, activeCombatantId: prev } : null,
    });
    expect(findDueEffects([e], ctx(3, "t"))).toHaveLength(1);
    expect(findDueEffects([e], ctx(3, "t", 2))).toHaveLength(0);
    expect(findDueEffects([e], ctx(3, "other"))).toHaveLength(0);
  });

  it("fires at the start of the source's turn", () => {
    const e = effect({ expiryTrigger: "start_of_source_turn" });
    expect(
      findDueEffects([e], { round: 3, activeCombatantId: "s", previous: null }),
    ).toHaveLength(1);
    expect(
      findDueEffects([e], { round: 2, activeCombatantId: "s", previous: null }),
    ).toHaveLength(0);
  });

  it("ignores inactive, untimed and source-less source-turn effects", () => {
    const ctx = {
      round: 9,
      activeCombatantId: "s",
      previous: { round: 9, activeCombatantId: "t" },
    };
    expect(findDueEffects([effect({ isActive: false })], ctx)).toHaveLength(0);
    expect(
      findDueEffects(
        [effect({ expiresAtRound: null, expiryTrigger: "none" })],
        ctx,
      ),
    ).toHaveLength(0);
    expect(
      findDueEffects(
        [
          effect({
            expiryTrigger: "start_of_source_turn",
            sourceCombatantId: null,
          }),
        ],
        ctx,
      ),
    ).toHaveLength(0);
  });
});

describe("invertChanges / matchesExpected", () => {
  const changes: Change[] = [
    { kind: "create", entity: "effect", id: "e1", row: {} },
    {
      kind: "update",
      entity: "combatant",
      id: "c1",
      before: { currentHp: 10 },
      after: { currentHp: 4 },
    },
  ];

  it("reverses order, swaps before/after, and turns creates into deletes", () => {
    const inverse = invertChanges(changes);
    expect(inverse[0]).toMatchObject({
      kind: "update",
      before: { currentHp: 4 },
      after: { currentHp: 10 },
    });
    expect(inverse[1]).toEqual({ kind: "delete", entity: "effect", id: "e1" });
  });

  it("matchesExpected compares values, dates and nulls", () => {
    expect(matchesExpected({ a: 1, b: null }, { a: 1, b: null })).toBe(true);
    expect(matchesExpected({ a: 1 }, { a: 2 })).toBe(false);
    expect(
      matchesExpected(
        { d: new Date("2026-01-01T00:00:00.000Z") },
        { d: "2026-01-01T00:00:00.000Z" },
      ),
    ).toBe(true);
    expect(matchesExpected({}, { x: null })).toBe(true);
  });
});

describe("numberedNames", () => {
  it("keeps a single name bare and numbers groups", () => {
    expect(numberedNames("Goblin", 1)).toEqual(["Goblin"]);
    expect(numberedNames("Goblin", 3)).toEqual([
      "Goblin 1",
      "Goblin 2",
      "Goblin 3",
    ]);
  });
});

describe("damage adjustment", () => {
  it("halves rounding down, doubles, negates, or leaves alone; applied once", () => {
    expect(adjustDamage(7, "none")).toBe(7);
    expect(adjustDamage(7, "resistance")).toBe(3);
    expect(adjustDamage(1, "resistance")).toBe(0);
    expect(adjustDamage(7, "vulnerability")).toBe(14);
    expect(adjustDamage(7, "immunity")).toBe(0);
  });

  const traits = {
    damageResistances: [
      "Fire",
      "Bludgeoning, Piercing, Slashing from Nonmagical Attacks",
    ],
    damageVulnerabilities: ["Cold"],
    damageImmunities: ["Poison"],
  };

  it("trusts exact entries only", () => {
    expect(suggestAdjustment(traits, "fire")).toMatchObject({
      adjustment: "resistance",
      certain: true,
    });
    expect(suggestAdjustment(traits, " COLD ")).toMatchObject({
      adjustment: "vulnerability",
      certain: true,
    });
    expect(suggestAdjustment(traits, "Poison")).toMatchObject({
      adjustment: "immunity",
      certain: true,
    });
  });

  it("leaves conditional entries to the DM", () => {
    const s = suggestAdjustment(traits, "slashing");
    expect(s).toMatchObject({ adjustment: "none", certain: false });
    expect(s.notes.join(" ")).toMatch(/conditions apply/);
  });

  it("does not guess without a type or data, or on conflicting entries", () => {
    expect(suggestAdjustment(traits, "").adjustment).toBe("none");
    expect(suggestAdjustment(null, "fire").certain).toBe(false);
    const both = suggestAdjustment(
      {
        damageResistances: ["Fire"],
        damageVulnerabilities: ["Fire"],
        damageImmunities: [],
      },
      "fire",
    );
    expect(both).toMatchObject({ adjustment: "none", certain: false });
    expect(suggestAdjustment(traits, "acid").adjustment).toBe("none");
  });

  it("temp HP absorbs first and excess damage is reported", () => {
    expect(applyDamage({ currentHp: 5, tempHp: 3 }, 10)).toMatchObject({
      currentHp: 0,
      tempHp: 0,
      absorbedByTemp: 3,
      appliedToHp: 5,
      overkill: 2,
    });
    expect(applyDamage({ currentHp: 5, tempHp: 0 }, 0)).toMatchObject({
      currentHp: 5,
    });
  });
});

describe("effectReminders", () => {
  const order = ["a", "b", "c"];
  const effect = (over: Partial<ReminderEffect>): ReminderEffect => ({
    id: "e1",
    targetId: "b",
    sourceCombatantId: "a",
    name: "Frightened",
    isActive: true,
    expiresAtRound: null,
    expiryTrigger: "none",
    ...over,
  });
  const at = (round: number, active: string, effects: ReminderEffect[]) =>
    effectReminders(effects, { round, activeCombatantId: active, order });

  it("never expires an untimed effect and reminds nothing", () => {
    expect(at(9, "b", [effect({})])).toEqual([]);
  });

  it("start-of-target-turn is due when that turn begins and stays due", () => {
    const e = effect({
      expiresAtRound: 2,
      expiryTrigger: "start_of_target_turn",
    });
    expect(at(2, "a", [e])).toEqual([]);
    expect(at(2, "b", [e])[0]).toMatchObject({ kind: "expiry", phase: "due" });
    expect(at(2, "c", [e])).toHaveLength(1);
    expect(at(3, "a", [e])).toHaveLength(1);
  });

  it("end-of-target-turn is only upcoming during the turn, due after it", () => {
    const e = effect({
      expiresAtRound: 2,
      expiryTrigger: "end_of_target_turn",
    });
    expect(at(2, "b", [e])[0]).toMatchObject({ phase: "upcoming" });
    expect(at(2, "c", [e])[0]).toMatchObject({ phase: "due" });
    expect(at(1, "c", [e])).toEqual([]);
  });

  it("uses the source's turn for source triggers", () => {
    const e = effect({
      expiresAtRound: 1,
      expiryTrigger: "end_of_source_turn",
    });
    expect(at(1, "b", [e])[0]).toMatchObject({ phase: "due" });
    expect(at(1, "a", [e])[0]).toMatchObject({ phase: "upcoming" });
  });

  it("asks the DM when the timing owner left the turn order", () => {
    const e = effect({
      sourceCombatantId: "gone",
      expiresAtRound: 5,
      expiryTrigger: "start_of_source_turn",
    });
    const [r] = at(1, "a", [e]);
    expect(r).toMatchObject({ phase: "due" });
    expect(r.text).toMatch(/Resolve it manually/);
  });

  it("reminds about saves and ongoing damage only on the target's turn, without resolving", () => {
    const e = effect({
      metadata: {
        save: { ability: "WIS", dc: 13, timing: "end" },
        remindAt: "start",
        damageDice: "1d6",
        damageType: "fire",
      },
    });
    expect(at(1, "a", [e])).toEqual([]);
    const reminders = at(1, "b", [e]);
    expect(reminders.map((r) => r.kind).sort()).toEqual(["ongoing", "save"]);
    expect(reminders.every((r) => r.phase === "upcoming")).toBe(true);
  });

  it("is a pure function of state, so repeating it never duplicates", () => {
    const e = effect({
      expiresAtRound: 1,
      expiryTrigger: "start_of_target_turn",
    });
    expect(at(1, "b", [e])).toEqual(at(1, "b", [e]));
    expect(at(1, "b", [e, e])).toHaveLength(2); // one per effect row, never per call
    expect(at(1, "b", [effect({ ...e, isActive: false })])).toEqual([]);
  });

  it("shows nothing before the combat starts", () => {
    expect(
      effectReminders([effect({})], {
        round: 0,
        activeCombatantId: null,
        order,
      }),
    ).toEqual([]);
  });
});
