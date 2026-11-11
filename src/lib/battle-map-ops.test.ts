import { describe, expect, it } from "vitest";
import {
  addLabel,
  addToken,
  addWalls,
  edgesAlong,
  emptyDoc,
  eraseEdge,
  eraseTerrain,
  labelAt,
  moveToken,
  nearestEdge,
  paintTerrain,
  placeDoor,
  removeToken,
  rotateToken,
  tokenAt,
  toggleDoor,
  updateSettings,
} from "./battle-map-ops";
import {
  mapDocSchema,
  sniffImageMime,
  type MapToken,
} from "./validation/battle-map";

const tok = (over: Partial<MapToken> = {}) => ({
  id: "t1",
  label: "Goblin",
  size: 1,
  color: "#b91c1c",
  shape: "circle" as const,
  ...over,
});

describe("battle map geometry", () => {
  it("finds the nearest grid edge", () => {
    expect(nearestEdge(2.05, 3.5)).toMatchObject({ x: 2, y: 3, d: "v" });
    expect(nearestEdge(2.95, 3.5)).toMatchObject({ x: 3, y: 3, d: "v" });
    expect(nearestEdge(2.5, 3.02)).toMatchObject({ x: 2, y: 3, d: "h" });
    expect(nearestEdge(2.5, 3.97)).toMatchObject({ x: 2, y: 4, d: "h" });
  });

  it("lists unit edges along the dominant axis", () => {
    expect(edgesAlong(1, 2, 4, 2)).toHaveLength(3);
    expect(edgesAlong(4, 2, 1, 3)).toEqual([
      { x: 1, y: 2, d: "h" },
      { x: 2, y: 2, d: "h" },
      { x: 3, y: 2, d: "h" },
    ]);
    expect(edgesAlong(2, 5, 2, 1)).toHaveLength(4);
    expect(edgesAlong(2, 2, 2, 2)).toEqual([]);
  });

  it("adds walls without duplicates and keeps them in bounds", () => {
    const doc = emptyDoc({ cols: 5, rows: 5 });
    const once = addWalls(doc, edgesAlong(0, 0, 3, 0));
    expect(once.walls).toHaveLength(3);
    expect(addWalls(once, edgesAlong(0, 0, 3, 0))).toBe(once);
    expect(addWalls(doc, [{ x: 9, y: 0, d: "h" }]).walls).toHaveLength(0);
    expect(mapDocSchema.safeParse(once).success).toBe(true);
  });

  it("doors replace walls on an edge and toggle open", () => {
    let doc = addWalls(emptyDoc(), [{ x: 2, y: 2, d: "v" }]);
    doc = placeDoor(doc, { x: 2, y: 2, d: "v" });
    expect(doc.walls).toHaveLength(0);
    expect(doc.doors).toEqual([{ x: 2, y: 2, d: "v", open: false }]);
    doc = toggleDoor(doc, { x: 2, y: 2, d: "v" });
    expect(doc.doors[0].open).toBe(true);
    doc = addWalls(doc, [{ x: 2, y: 2, d: "v" }]);
    expect(doc.doors).toHaveLength(0);
    expect(doc.walls).toHaveLength(1);
    expect(eraseEdge(doc, { x: 2, y: 2, d: "v" }).walls).toHaveLength(0);
  });

  it("paints and erases terrain one type per cell", () => {
    let doc = paintTerrain(emptyDoc(), 1, 1, "difficult");
    doc = paintTerrain(doc, 1, 1, "obstacle");
    expect(doc.terrain).toEqual([{ x: 1, y: 1, kind: "obstacle" }]);
    expect(paintTerrain(doc, 1, 1, "obstacle")).toBe(doc);
    expect(paintTerrain(doc, 99, 1, "obstacle")).toBe(doc);
    expect(eraseTerrain(doc, 1, 1).terrain).toEqual([]);
  });

  it("places, moves, rotates, and removes tokens inside the grid", () => {
    let doc = addToken(emptyDoc({ cols: 10, rows: 10 }), tok({ x: 2, y: 2 }));
    expect(tokenAt(doc, 2, 2)?.id).toBe("t1");
    doc = moveToken(doc, "t1", 50, -3);
    expect(doc.tokens[0]).toMatchObject({ x: 9, y: 0 });
    doc = rotateToken(doc, "t1", -45);
    expect(doc.tokens[0].rotation).toBe(315);
    doc = rotateToken(doc, "t1", 90);
    expect(doc.tokens[0].rotation).toBe(45);
    expect(removeToken(doc, "t1").tokens).toEqual([]);
  });

  it("keeps large tokens inside the grid and picks the topmost", () => {
    let doc = addToken(
      emptyDoc({ cols: 10, rows: 10 }),
      tok({ size: 3, x: 9, y: 9 }),
    );
    expect(doc.tokens[0]).toMatchObject({ x: 7, y: 7 });
    doc = addToken(doc, tok({ id: "t2", x: 8, y: 8 }));
    expect(tokenAt(doc, 8, 8)?.id).toBe("t2");
    expect(tokenAt(doc, 7, 7)?.id).toBe("t1");
    expect(tokenAt(doc, 0, 0)).toBeNull();
  });

  it("drops or clamps content when the grid shrinks", () => {
    let doc = emptyDoc({ cols: 20, rows: 20 });
    doc = addToken(doc, tok({ x: 18, y: 18 }));
    doc = addWalls(doc, edgesAlong(0, 15, 10, 15));
    doc = paintTerrain(doc, 17, 17, "difficult");
    const small = updateSettings(doc, { cols: 10, rows: 10 });
    expect(small.tokens[0]).toMatchObject({ x: 9, y: 9 });
    expect(small.walls).toHaveLength(0);
    expect(small.terrain).toHaveLength(0);
    expect(mapDocSchema.safeParse(small).success).toBe(true);
  });
});

describe("battle map validation", () => {
  it("accepts an empty map and rejects out-of-range settings", () => {
    expect(mapDocSchema.safeParse(emptyDoc()).success).toBe(true);
    expect(mapDocSchema.safeParse(emptyDoc({ cols: 500 })).success).toBe(false);
    expect(mapDocSchema.safeParse(emptyDoc({ cellSize: 5 })).success).toBe(
      false,
    );
  });

  it("rejects tokens outside the grid, duplicate ids, and bad colors", () => {
    const base = emptyDoc({ cols: 10, rows: 10 });
    const t = { ...tok(), x: 3, y: 3, rotation: 0 };
    expect(
      mapDocSchema.safeParse({ ...base, tokens: [{ ...t, x: 10 }] }).success,
    ).toBe(false);
    expect(mapDocSchema.safeParse({ ...base, tokens: [t, t] }).success).toBe(
      false,
    );
    expect(
      mapDocSchema.safeParse({ ...base, tokens: [{ ...t, color: "red" }] })
        .success,
    ).toBe(false);
  });

  it("rejects shared edges and double terrain", () => {
    const base = emptyDoc();
    expect(
      mapDocSchema.safeParse({
        ...base,
        walls: [{ x: 1, y: 1, d: "h" }],
        doors: [{ x: 1, y: 1, d: "h", open: false }],
      }).success,
    ).toBe(false);
    expect(
      mapDocSchema.safeParse({
        ...base,
        terrain: [
          { x: 1, y: 1, kind: "difficult" },
          { x: 1, y: 1, kind: "obstacle" },
        ],
      }).success,
    ).toBe(false);
  });

  it("recognises PNG, JPEG, and WebP only", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = new TextEncoder().encode("RIFF1234WEBPVP8 ");
    expect(sniffImageMime(png)).toBe("image/png");
    expect(sniffImageMime(jpg)).toBe("image/jpeg");
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(
      sniffImageMime(new TextEncoder().encode("<svg xmlns=''></svg>")),
    ).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe("labels", () => {
  const label = {
    id: "l1",
    text: "Bedroom",
    x: 2,
    y: 2,
    w: 3,
    h: 2,
    linkMapId: null,
  };

  it("adds labels inside the grid, finds them, and clips on shrink", () => {
    const doc = emptyDoc({ cols: 10, rows: 10 });
    expect(addLabel(doc, { ...label, x: 9 }).labels).toHaveLength(0);
    const withLabel = addLabel(doc, label);
    expect(labelAt(withLabel, 3, 3)?.id).toBe("l1");
    expect(labelAt(withLabel, 5, 3)).toBeNull();
    const shrunk = updateSettings(withLabel, { cols: 5 });
    expect(shrunk.labels[0].w).toBe(3);
    const clipped = updateSettings(withLabel, { cols: 5, rows: 5 });
    expect(clipped.labels).toHaveLength(1);
    expect(mapDocSchema.safeParse(clipped).success).toBe(true);
  });

  it("defaults labels for older saved documents", () => {
    const { labels: _omit, ...old } = emptyDoc();
    void _omit;
    const parsed = mapDocSchema.parse(old);
    expect(parsed.labels).toEqual([]);
  });
});
