import { describe, expect, it } from "vitest";
import { reachablePositions, squaresBetween } from "@/lib/battle-map-movement";
import { parseSpeedFeet } from "@/lib/battle-map-links";
import { placeCombatantTokens } from "@/lib/battle-map-ops";
import type { MapDoc } from "@/lib/validation/battle-map";

const doc = (over: Partial<MapDoc> = {}): MapDoc =>
  ({
    settings: { cols: 10, rows: 10, cellSize: 50, feetPerCell: 5 },
    tokens: [],
    walls: [],
    doors: [],
    terrain: [],
    labels: [],
    ...over,
  }) as unknown as MapDoc;

const tok = { x: 5, y: 5, size: 1 };

describe("movement", () => {
  it("counts diagonals as one square", () => {
    expect(squaresBetween(0, 0, 3, 2)).toBe(3);
  });
  it("reaches a square radius on open ground", () => {
    const r = reachablePositions(doc(), tok, 2);
    expect(r.size).toBe(25);
    expect(r.get("7:7")).toBe(2);
  });
  it("is stopped by walls and closed doors but not open doors", () => {
    const wall = { x: 6, y: 5, d: "v" as const };
    const walled = reachablePositions(doc({ walls: [wall] }), tok, 1);
    expect(walled.has("6:5")).toBe(false);
    const closed = reachablePositions(
      doc({ doors: [{ ...wall, open: false }] }),
      tok,
      1,
    );
    expect(closed.has("6:5")).toBe(false);
    const open = reachablePositions(
      doc({ doors: [{ ...wall, open: true }] }),
      tok,
      1,
    );
    expect(open.has("6:5")).toBe(true);
  });
  it("does not cut corners around walls", () => {
    const r = reachablePositions(
      doc({ walls: [{ x: 6, y: 5, d: "v" }] }),
      tok,
      1,
    );
    expect(r.has("6:6")).toBe(false);
    expect(r.has("5:6")).toBe(true);
  });
  it("doubles cost on difficult terrain and blocks obstacles", () => {
    const r = reachablePositions(
      doc({
        terrain: [
          { x: 6, y: 5, kind: "difficult" },
          { x: 4, y: 5, kind: "obstacle" },
        ],
      }),
      tok,
      2,
    );
    expect(r.get("6:5")).toBe(2);
    expect(r.has("7:5")).toBe(true); // around via diagonal
    expect(r.has("4:5")).toBe(false);
  });
  it("keeps large tokens on the grid and out of obstacles", () => {
    const r = reachablePositions(
      doc({ terrain: [{ x: 3, y: 5, kind: "obstacle" }] }),
      { x: 4, y: 4, size: 2 },
      4,
    );
    expect(r.has("8:4")).toBe(true);
    expect(r.has("9:4")).toBe(false);
    expect(r.has("2:4")).toBe(false);
  });
});

describe("speed parsing", () => {
  it("prefers walk speed", () => {
    expect(parseSpeedFeet(["fly: 60 ft.", "walk: 30 ft."])).toBe(30);
  });
  it("reads plain feet and never invents a value", () => {
    expect(parseSpeedFeet(["25 ft."])).toBe(25);
    expect(parseSpeedFeet(["fly: 60 ft."])).toBeNull();
    expect(parseSpeedFeet([])).toBeNull();
  });
});

describe("placeCombatantTokens", () => {
  it("adds linked tokens once with dispositions", () => {
    let n = 0;
    const seeds = [
      { id: "a", name: "Hero", side: "party" as const },
      { id: "b", name: "Orc", side: "enemy" as const },
    ];
    const once = placeCombatantTokens(doc(), seeds, () => `t${n++}`);
    expect(once.tokens.map((t) => t.disposition)).toEqual(["ally", "hostile"]);
    expect(once.tokens[1].x).toBe(9);
    const twice = placeCombatantTokens(once, seeds, () => `t${n++}`);
    expect(twice.tokens).toHaveLength(2);
  });
});
