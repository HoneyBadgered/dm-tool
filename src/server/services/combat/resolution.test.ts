import { describe, expect, it } from "vitest";
import {
  buildResolution,
  checkBonus,
  makeRollRecord,
  rollRecordSchema,
  savingThrowBonus,
  type Party,
} from "./resolution";
import type { CreatureSnapshot } from "@/lib/validation/combat";

const snap = (over: Partial<CreatureSnapshot> = {}) =>
  ({
    armorClass: 15,
    abilityScores: [
      { label: "DEX", value: 14 },
      { label: "STR", value: 8 },
    ],
    savingThrowsAndSkills: ["Saving Throw: DEX +5", "Skill: Stealth +6"],
    damageResistances: [],
    damageVulnerabilities: [],
    damageImmunities: [],
    conditionImmunities: [],
    ...over,
  }) as unknown as CreatureSnapshot;

const party = (
  id: string,
  ac = 15,
  snapshot: CreatureSnapshot | null = null,
): Party => ({
  id,
  name: id,
  armorClass: ac,
  snapshot,
});

const base = {
  kind: "attack" as const,
  actorId: "a",
  targetId: "t",
  label: "Slash",
  bonus: 5,
  mode: "normal" as const,
  dc: null,
  halfOnSuccess: false,
};

describe("attack resolution", () => {
  it("compares total to AC", () => {
    const hit = makeRollRecord({
      ...base,
      manualD20: [10],
      damage: [{ expr: "1d8+3", type: "slashing", manual: [4] }],
    });
    const r = buildResolution(hit, {
      actor: party("a"),
      subject: party("t", 15),
    });
    expect(r.success).toBe(true);
    expect(r.critical).toBe(false);
    expect(r.final).toBe(7);
    const miss = buildResolution(hit, {
      actor: party("a"),
      subject: party("t", 16),
    });
    expect(miss.success).toBe(false);
    expect(miss.final).toBe(0);
  });

  it("natural 20 hits and crits; doubles dice not modifiers", () => {
    const rec = makeRollRecord({
      ...base,
      manualD20: [20],
      damage: [{ expr: "1d8+3", type: "slashing", manual: [4, 6] }],
    });
    const r = buildResolution(rec, {
      actor: party("a"),
      subject: party("t", 30),
    });
    expect(r.success).toBe(true);
    expect(r.critical).toBe(true);
    expect(r.final).toBe(13);
  });

  it("natural 1 misses even when the total beats AC", () => {
    const rec = makeRollRecord({
      ...base,
      bonus: 30,
      manualD20: [1],
      damage: [],
    });
    expect(
      buildResolution(rec, { actor: party("a"), subject: party("t", 10) })
        .success,
    ).toBe(false);
  });

  it("advantage takes the higher die", () => {
    const rec = makeRollRecord({
      ...base,
      mode: "advantage",
      manualD20: [4, 17],
      damage: [],
    });
    const r = buildResolution(rec, { actor: party("a"), subject: party("t") });
    expect(r.d20.natural).toBe(17);
    expect(r.d20.discarded).toBe(4);
  });

  it("rejects wrong d20 counts", () => {
    expect(() =>
      makeRollRecord({
        ...base,
        mode: "advantage",
        manualD20: [4],
        damage: [],
      }),
    ).toThrow();
    expect(() =>
      makeRollRecord({ ...base, manualD20: [21], damage: [] }),
    ).toThrow();
  });

  it("auto-rolls missing critical dice when physical dice are entered", () => {
    const rec = makeRollRecord({
      ...base,
      manualD20: [20],
      damage: [{ expr: "2d6", type: null, manual: [1, 2] }],
    });
    expect(rec.damage[0].rolls[0]).toHaveLength(4);
    expect(rec.damage[0].rolls[0].slice(0, 2)).toEqual([1, 2]);
  });

  it("applies overrides and suggestions per type", () => {
    const rec = makeRollRecord({
      ...base,
      manualD20: [10],
      damage: [
        { expr: "1d8", type: "Fire", manual: [8] },
        { expr: "1d6", type: "fire", manual: [4] },
        { expr: "2", type: null },
      ],
    });
    const target = party("t", 10, snap({ damageResistances: ["Fire"] }));
    const r = buildResolution(rec, { actor: party("a"), subject: target });
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]).toMatchObject({
      raw: 12,
      adjustment: "resistance",
      adjusted: 6,
    });
    expect(r.final).toBe(6 + 2);
    const o = buildResolution(
      rec,
      { actor: party("a"), subject: target },
      {
        adjustments: { fire: "none" },
      },
    );
    expect(o.final).toBe(14);
    const f = buildResolution(
      rec,
      { actor: party("a"), subject: target },
      { final: 1 },
    );
    expect(f.final).toBe(1);
    expect(f.finalOverridden).toBe(true);
    const h = buildResolution(
      rec,
      { actor: party("a"), subject: party("t", 99) },
      { hit: "hit" },
    );
    expect(h.success).toBe(true);
  });
});

describe("saves and checks", () => {
  const save = (d20: number, half: boolean) =>
    makeRollRecord({
      kind: "save",
      actorId: "t",
      targetId: null,
      label: "DEX save",
      bonus: 2,
      mode: "normal",
      dc: 15,
      halfOnSuccess: half,
      manualD20: [d20],
      damage: [{ expr: "8d6", type: "fire", manual: [4, 4, 4, 4, 4, 4, 4, 4] }],
    });
  it("fails below DC and takes full damage", () => {
    const r = buildResolution(save(5, true), {
      actor: party("t"),
      subject: party("t"),
    });
    expect(r.success).toBe(false);
    expect(r.final).toBe(32);
  });
  it("halves on success when flagged, none otherwise; no nat-20 effect", () => {
    const r = buildResolution(save(13, true), {
      actor: party("t"),
      subject: party("t"),
    });
    expect(r.success).toBe(true);
    expect(r.final).toBe(16);
    expect(
      buildResolution(save(13, false), {
        actor: party("t"),
        subject: party("t"),
      }).final,
    ).toBe(0);
    const nat20 = buildResolution(
      save(20, true),
      { actor: party("t"), subject: party("t") },
      {},
    );
    expect(nat20.critical).toBe(false);
    const low = makeRollRecord({
      kind: "save",
      actorId: "t",
      targetId: null,
      label: "x",
      bonus: -20,
      mode: "normal",
      dc: 15,
      halfOnSuccess: false,
      manualD20: [20],
      damage: [],
    });
    expect(
      buildResolution(low, { actor: party("t"), subject: party("t") }).success,
    ).toBe(false);
  });
  it("requires a DC and forbids damage on checks", () => {
    expect(
      rollRecordSchema.safeParse({
        v: 1,
        kind: "check",
        actorId: "a",
        targetId: null,
        label: "x",
        bonus: 0,
        mode: "normal",
        d20: [5],
        manual: false,
        dc: null,
        halfOnSuccess: false,
        damage: [],
      }).success,
    ).toBe(false);
  });
});

describe("bonus lookup", () => {
  it("uses listed values, else modifier, else unknown", () => {
    expect(savingThrowBonus(snap(), "DEX")).toEqual({
      bonus: 5,
      basis: "listed",
    });
    expect(savingThrowBonus(snap(), "STR")).toEqual({
      bonus: -1,
      basis: "ability modifier",
    });
    expect(checkBonus(snap(), "DEX", "Stealth")).toEqual({
      bonus: 6,
      basis: "listed",
    });
    expect(checkBonus(null, "DEX")).toEqual({ bonus: null, basis: "unknown" });
  });
});
