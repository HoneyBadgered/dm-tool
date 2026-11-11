import { describe, expect, it } from "vitest";
import {
  estimateCover,
  hasLineOfSight,
  playerView,
  templateCells,
  tokensInCells,
} from "@/lib/battle-map-vision";
import {
  addToken,
  emptyDoc,
  setFogRect,
  setFogEnabled,
} from "@/lib/battle-map-ops";
import type { MapDoc } from "@/lib/validation/battle-map";

const base = (over: Partial<MapDoc> = {}): MapDoc => ({
  ...emptyDoc({ cols: 12, rows: 12, feetPerCell: 5 }),
  ...over,
});
const a = { x: 1, y: 5, size: 1 };
const b = { x: 6, y: 5, size: 1 };

describe("line of sight and cover", () => {
  it("is clear on open ground", () => {
    expect(hasLineOfSight(base(), a, b)).toBe(true);
    expect(estimateCover(base(), a, b).cover).toBe("none");
  });
  it("is blocked by a wall across the line", () => {
    const d = base({ walls: [{ x: 4, y: 5, d: "v" }] });
    expect(hasLineOfSight(d, a, b)).toBe(false);
  });
  it("is not blocked by an open door but is by a closed one", () => {
    const door = { x: 4, y: 5, d: "v" as const };
    expect(
      hasLineOfSight(base({ doors: [{ ...door, open: true }] }), a, b),
    ).toBe(true);
    expect(
      hasLineOfSight(base({ doors: [{ ...door, open: false }] }), a, b),
    ).toBe(false);
  });
  it("is blocked by an obstacle in between", () => {
    const d = base({ terrain: [{ x: 3, y: 5, kind: "obstacle" }] });
    expect(hasLineOfSight(d, a, b)).toBe(false);
  });
  it("is not blocked by difficult terrain", () => {
    const d = base({ terrain: [{ x: 3, y: 5, kind: "difficult" }] });
    expect(hasLineOfSight(d, a, b)).toBe(true);
  });
  it("reports partial cover for a short wall piece beside the line", () => {
    const d = base({ walls: [{ x: 5, y: 5, d: "v" }] });
    const r = estimateCover(d, a, b);
    expect(["half", "three-quarters"]).toContain(r.cover);
  });
  it("reports total cover behind a full wall", () => {
    const walls = Array.from({ length: 12 }, (_, y) => ({
      x: 4,
      y,
      d: "v" as const,
    }));
    expect(estimateCover(base({ walls }), a, b).cover).toBe("total");
  });
});

describe("templates", () => {
  const origin = { x: 5, y: 5 };
  it("fills a circle by square centers", () => {
    const cells = templateCells(base(), {
      shape: "circle",
      origin,
      toward: origin,
      sizeFeet: 10,
      widthFeet: 5,
    });
    expect(cells).toHaveLength(12);
  });
  it("points a cone along its facing", () => {
    const cells = templateCells(base(), {
      shape: "cone",
      origin,
      toward: { x: 9, y: 5 },
      sizeFeet: 15,
      widthFeet: 5,
    });
    expect(cells.every((c) => c.x >= 5)).toBe(true);
    expect(cells.some((c) => c.x === 7 && c.y === 5)).toBe(true);
    expect(cells.some((c) => c.x === 8 && c.y === 5)).toBe(false);
  });
  it("makes a line of the given width and finds tokens", () => {
    const cells = templateCells(base(), {
      shape: "line",
      origin: { x: 0, y: 5.5 },
      toward: { x: 5, y: 5.5 },
      sizeFeet: 20,
      widthFeet: 5,
    });
    expect(cells).toHaveLength(4);
    const d = addToken(base(), {
      id: "t",
      label: "T",
      size: 1,
      color: "#000000",
      shape: "circle",
      x: 2,
      y: 5,
    });
    expect(tokensInCells(d, cells)).toHaveLength(1);
  });
});

describe("player view", () => {
  it("hides DM-only items and fogged areas", () => {
    let d = base();
    const tok = {
      label: "T",
      size: 1,
      color: "#000000",
      shape: "circle" as const,
    };
    d = addToken(d, { ...tok, id: "open", x: 1, y: 1 });
    d = addToken(d, { ...tok, id: "secret", x: 2, y: 1, dmOnly: true });
    d = addToken(d, { ...tok, id: "fogged", x: 8, y: 8 });
    d = {
      ...d,
      walls: [
        { x: 1, y: 1, d: "h" },
        { x: 8, y: 8, d: "h" },
      ],
    };
    expect(playerView(d).tokens).toHaveLength(3 - 1);
    d = setFogEnabled(d, true);
    d = setFogRect(d, 0, 0, 3, 3, true);
    const v = playerView(d);
    expect(v.tokens.map((t) => t.id)).toEqual(["open"]);
    expect(v.walls).toEqual([{ x: 1, y: 1, d: "h" }]);
  });
  it("hides cells again", () => {
    let d = setFogRect(base(), 0, 0, 2, 2, true);
    expect(d.fog.revealed).toHaveLength(9);
    d = setFogRect(d, 1, 1, 5, 5, false);
    expect(d.fog.revealed).toHaveLength(5);
  });
});
