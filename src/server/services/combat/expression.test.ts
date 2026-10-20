import { describe, expect, it } from "vitest";
import {
  DiceInputError,
  distributeValues,
  doubleDice,
  parseDiceValues,
  parseExpression,
  rollExpression,
} from "./expression";

const seq = (...v: number[]) => {
  let i = 0;
  return () => (v[i++] - 1) / 1000 + 0.0001; // maps to a die face via floor(r*sides)+1 for small dice
};

describe("parseExpression", () => {
  it("parses dice and modifiers", () => {
    const r = parseExpression("2d6 + 1d8 - 3");
    expect(r.ok && r.terms.length).toBe(3);
  });
  it.each([
    "",
    "abc",
    "2d",
    "d1",
    "0d6",
    "101d6",
    "1d6+",
    "1d6*2",
    "process.exit()",
    "2d6kh3",
    "1d1001",
    "99999",
    "1d6;1d6",
  ])("rejects %j", (s) => {
    expect(parseExpression(s).ok).toBe(false);
  });
  it("limits terms and length", () => {
    expect(parseExpression(Array(21).fill("1").join("+")).ok).toBe(false);
    expect(parseExpression("1".repeat(101)).ok).toBe(false);
  });
});

describe("evaluation", () => {
  it("uses manual dice and validates them", () => {
    const e = rollExpression("2d6+3", { rolls: [[4, 5]] });
    expect(e.total).toBe(12);
    expect(() => rollExpression("2d6", { rolls: [[4, 7]] })).toThrow(
      DiceInputError,
    );
    expect(() => rollExpression("2d6", { rolls: [[4]] })).toThrow(
      DiceInputError,
    );
  });
  it("keeps highest/lowest and subtracts", () => {
    expect(rollExpression("4d6kh3", { rolls: [[1, 6, 5, 4]] }).total).toBe(15);
    expect(rollExpression("2d20kl", { rolls: [[3, 9]] }).total).toBe(3);
    expect(rollExpression("10-1d4", { rolls: [[3]] }).total).toBe(7);
  });
  it("rolls within range with an rng", () => {
    for (let i = 0; i < 50; i++) {
      const t = rollExpression("3d4").total;
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(12);
    }
    expect(seq(1)).toBeTypeOf("function");
  });
  it("doubles dice but not constants", () => {
    const p = parseExpression("2d6+4");
    if (!p.ok) throw new Error();
    const e = rollExpression("2d6+4", { rolls: [[1, 1]] });
    expect(e.total).toBe(6);
    const crit = doubleDice(p.terms);
    expect(crit[0]).toMatchObject({ count: 4 });
    expect(crit[1]).toMatchObject({ value: 4 });
  });
  it("parses and distributes physical values", () => {
    expect(parseDiceValues("4, 5 6")).toEqual([4, 5, 6]);
    expect(parseDiceValues("4,x")).toBeNull();
    const p = parseExpression("1d8+2d6");
    if (!p.ok) throw new Error();
    expect(distributeValues(p.terms, [3, 1, 2])).toEqual([[3], [1, 2]]);
    expect(() => distributeValues(p.terms, [3])).toThrow(DiceInputError);
  });
});
