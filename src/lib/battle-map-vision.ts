import type { MapDoc, MapToken } from "@/lib/validation/battle-map";

type Pt = { x: number; y: number };
type Seg = [number, number, number, number];
type Box = [number, number, number, number];

const EPS = 1e-9;

export type Blockers = { segments: Seg[]; boxes: Box[] };

/** Joins touching collinear edges so a ray cannot slip through the shared vertex. */
function mergeEdges(edges: { x: number; y: number; d: "h" | "v" }[]): Seg[] {
  const lines = new Map<string, number[]>();
  for (const e of edges) {
    const key = `${e.d}:${e.d === "h" ? e.y : e.x}`;
    const list = lines.get(key) ?? [];
    list.push(e.d === "h" ? e.x : e.y);
    lines.set(key, list);
  }
  const out: Seg[] = [];
  for (const [key, positions] of lines) {
    const [d, at] = key.split(":");
    const fixed = Number(at);
    const sorted = [...new Set(positions)].sort((p, q) => p - q);
    let start = sorted[0];
    let prev = sorted[0];
    const flush = () =>
      out.push(
        d === "h"
          ? [start, fixed, prev + 1, fixed]
          : [fixed, start, fixed, prev + 1],
      );
    for (const p of sorted.slice(1)) {
      if (p !== prev + 1) {
        flush();
        start = p;
      }
      prev = p;
    }
    flush();
  }
  return out;
}

/** Walls, closed doors, and obstacles. Open doors and other tokens do not block. */
export function blockersFor(doc: MapDoc): Blockers {
  return {
    segments: mergeEdges([...doc.walls, ...doc.doors.filter((d) => !d.open)]),
    boxes: doc.terrain
      .filter((c) => c.kind === "obstacle")
      .map((c): Box => [c.x, c.y, c.x + 1, c.y + 1]),
  };
}

const cross = (ax: number, ay: number, bx: number, by: number) =>
  ax * by - ay * bx;

/** True only when the two segments properly cross; touching at an end does not count. */
function segmentsCross(a: Seg, b: Seg): boolean {
  const [x1, y1, x2, y2] = a;
  const [x3, y3, x4, y4] = b;
  const d1 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1);
  const d2 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);
  const d3 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3);
  const d4 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

/** True when the segment passes through the open interior of the box. */
function segmentHitsBox(s: Seg, box: Box): boolean {
  const [x1, y1, x2, y2] = s;
  const [bx1, by1, bx2, by2] = box;
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < EPS) return q > EPS;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, x1 - bx1) &&
    clip(dx, bx2 - x1) &&
    clip(-dy, y1 - by1) &&
    clip(dy, by2 - y1) &&
    t1 - t0 > EPS
  );
}

export function isBlocked(blockers: Blockers, a: Pt, b: Pt): boolean {
  const s: Seg = [a.x, a.y, b.x, b.y];
  return (
    blockers.segments.some((w) => segmentsCross(s, w)) ||
    blockers.boxes.some((box) => segmentHitsBox(s, box))
  );
}

type Footprint = Pick<MapToken, "x" | "y" | "size">;

const center = (t: Footprint): Pt => ({
  x: t.x + t.size / 2,
  y: t.y + t.size / 2,
});
const corners = (t: Footprint): Pt[] => [
  { x: t.x, y: t.y },
  { x: t.x + t.size, y: t.y },
  { x: t.x, y: t.y + t.size },
  { x: t.x + t.size, y: t.y + t.size },
];

export function hasLineOfSight(
  doc: MapDoc,
  from: Footprint,
  to: Footprint,
): boolean {
  return !isBlocked(blockersFor(doc), center(from), center(to));
}

export type Cover = "none" | "half" | "three-quarters" | "total";

/**
 * Corner-to-corner estimate: from the attacker's best corner, count how many
 * lines to the target's four corners are blocked. 0 none, 1–2 half,
 * 3 three-quarters, 4 total. Walls, closed doors, and obstacles count as
 * cover; creatures do not. This is a grid-based estimate, not a ruling.
 */
export function estimateCover(
  doc: MapDoc,
  from: Footprint,
  to: Footprint,
): { cover: Cover; blockedLines: number } {
  const blockers = blockersFor(doc);
  const targetCorners = corners(to);
  let best = 4;
  for (const a of corners(from)) {
    const blocked = targetCorners.filter((b) =>
      isBlocked(blockers, a, b),
    ).length;
    best = Math.min(best, blocked);
  }
  const cover: Cover =
    best === 0
      ? "none"
      : best <= 2
        ? "half"
        : best === 3
          ? "three-quarters"
          : "total";
  return { cover, blockedLines: best };
}

export type TemplateShape = "circle" | "cone" | "line" | "cube";

export type Template = {
  shape: TemplateShape;
  origin: Pt;
  /** Any point along the facing; ignored for circles. */
  toward: Pt;
  sizeFeet: number;
  /** Line width in feet. */
  widthFeet: number;
};

/** Grid squares whose centers fall inside the template. */
export function templateCells(
  doc: MapDoc,
  t: Template,
): { x: number; y: number }[] {
  const { cols, rows, feetPerCell } = doc.settings;
  const size = t.sizeFeet / feetPerCell;
  const width = t.widthFeet / feetPerCell;
  let dx = t.toward.x - t.origin.x;
  let dy = t.toward.y - t.origin.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  const out: { x: number; y: number }[] = [];
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const vx = x + 0.5 - t.origin.x;
      const vy = y + 0.5 - t.origin.y;
      const along = vx * dx + vy * dy;
      const perp = Math.abs(vx * dy - vy * dx);
      let inside = false;
      if (t.shape === "circle") inside = Math.hypot(vx, vy) <= size + EPS;
      else if (t.shape === "cone")
        inside = along >= 0 && along <= size + EPS && perp <= along / 2 + EPS;
      else if (t.shape === "line")
        inside = along >= 0 && along <= size + EPS && perp <= width / 2 + EPS;
      else inside = along >= 0 && along <= size + EPS && perp <= size / 2 + EPS;
      if (inside) out.push({ x, y });
    }
  }
  return out;
}

/** Tokens with at least one square under the template. */
export function tokensInCells(
  doc: MapDoc,
  cells: { x: number; y: number }[],
): MapToken[] {
  const set = new Set(cells.map((c) => `${c.x}:${c.y}`));
  return doc.tokens.filter((t) => {
    for (let dx = 0; dx < t.size; dx++)
      for (let dy = 0; dy < t.size; dy++)
        if (set.has(`${t.x + dx}:${t.y + dy}`)) return true;
    return false;
  });
}

/**
 * What the players may see: DM-only tokens and labels are removed, and with
 * fog on, everything outside revealed squares is removed too. Links, speeds
 * and other DM data are stripped from tokens.
 */
export function playerView(doc: MapDoc): MapDoc {
  const revealed = new Set(doc.fog.revealed.map((c) => `${c.x}:${c.y}`));
  const fog = doc.fog.enabled;
  const seen = (x: number, y: number) => !fog || revealed.has(`${x}:${y}`);
  const edgeSeen = (e: { x: number; y: number; d: "h" | "v" }) =>
    seen(e.x, e.y) || (e.d === "h" ? seen(e.x, e.y - 1) : seen(e.x - 1, e.y));
  const anySeen = (x: number, y: number, w: number, h: number) => {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) if (seen(x + i, y + j)) return true;
    return false;
  };
  return {
    ...doc,
    tokens: doc.tokens
      .filter((t) => !t.dmOnly && anySeen(t.x, t.y, t.size, t.size))
      .map((t) => ({ ...t, link: null, speed: null })),
    labels: doc.labels
      .filter((l) => !l.dmOnly && anySeen(l.x, l.y, l.w, l.h))
      .map((l) => ({ ...l, linkMapId: null })),
    walls: doc.walls.filter(edgeSeen),
    doors: doc.doors.filter(edgeSeen),
    terrain: doc.terrain.filter((c) => seen(c.x, c.y)),
    fog: doc.fog,
  };
}
