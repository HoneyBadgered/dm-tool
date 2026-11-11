import type { MapDoc, MapToken } from "@/lib/validation/battle-map";

/** Squares between two squares; diagonals count as one square. */
export function squaresBetween(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

type Terrain = {
  blocked: Set<string>;
  obstacles: Set<string>;
  difficult: Set<string>;
};

function terrainIndex(doc: MapDoc): Terrain {
  const blocked = new Set<string>();
  for (const w of doc.walls) blocked.add(`${w.d}:${w.x}:${w.y}`);
  for (const d of doc.doors) if (!d.open) blocked.add(`${d.d}:${d.x}:${d.y}`);
  const obstacles = new Set<string>();
  const difficult = new Set<string>();
  for (const c of doc.terrain)
    (c.kind === "obstacle" ? obstacles : difficult).add(`${c.x}:${c.y}`);
  return { blocked, obstacles, difficult };
}

/**
 * Squares a token can reach with `budget` squares of movement, as a map from
 * "x:y" (top-left of the token) to its cost. Moving diagonally costs the same
 * as moving straight, difficult terrain costs double, and walls, closed doors,
 * and obstacles stop movement. A diagonal step cannot cut a corner: both
 * straight routes around it must be open. Other tokens do not block.
 */
export function reachablePositions(
  doc: MapDoc,
  token: Pick<MapToken, "x" | "y" | "size">,
  budget: number,
): Map<string, number> {
  const { cols, rows } = doc.settings;
  const { blocked, obstacles, difficult } = terrainIndex(doc);
  const size = token.size;

  const footprintFits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + size > cols || y + size > rows) return false;
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++)
        if (obstacles.has(`${x + dx}:${y + dy}`)) return false;
    return true;
  };
  const edgesOpen = (x: number, y: number, dx: number, dy: number) => {
    for (let i = 0; i < size; i++) {
      if (dx === 1 && blocked.has(`v:${x + size}:${y + i}`)) return false;
      if (dx === -1 && blocked.has(`v:${x}:${y + i}`)) return false;
      if (dy === 1 && blocked.has(`h:${x + i}:${y + size}`)) return false;
      if (dy === -1 && blocked.has(`h:${x + i}:${y}`)) return false;
    }
    return true;
  };
  const straight = (x: number, y: number, dx: number, dy: number) =>
    footprintFits(x + dx, y + dy) && edgesOpen(x, y, dx, dy);
  const stepCost = (x: number, y: number) => {
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++)
        if (difficult.has(`${x + dx}:${y + dy}`)) return 2;
    return 1;
  };

  const cost = new Map<string, number>([[`${token.x}:${token.y}`, 0]]);
  const buckets: [number, number][][] = Array.from(
    { length: budget + 3 },
    () => [],
  );
  buckets[0].push([token.x, token.y]);
  for (let c = 0; c <= budget; c++) {
    for (const [x, y] of buckets[c]) {
      if (cost.get(`${x}:${y}`) !== c) continue;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const open =
            dx && dy
              ? straight(x, y, dx, 0) &&
                straight(x + dx, y, 0, dy) &&
                straight(x, y, 0, dy) &&
                straight(x, y + dy, dx, 0)
              : straight(x, y, dx, dy);
          if (!open) continue;
          const nx = x + dx;
          const ny = y + dy;
          const total = c + stepCost(nx, ny);
          if (total > budget) continue;
          const key = `${nx}:${ny}`;
          const known = cost.get(key);
          if (known === undefined || total < known) {
            cost.set(key, total);
            buckets[total].push([nx, ny]);
          }
        }
      }
    }
  }
  return cost;
}
