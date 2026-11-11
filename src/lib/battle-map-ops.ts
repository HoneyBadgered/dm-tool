import {
  MAP_LIMITS,
  type MapDoc,
  type MapLabel,
  type MapSettings,
  type MapToken,
  type TerrainKind,
} from "@/lib/validation/battle-map";

export type EdgeDir = "h" | "v";
export type EdgeRef = { x: number; y: number; d: EdgeDir };

export const DEFAULT_SETTINGS: MapSettings = {
  cols: 30,
  rows: 20,
  cellSize: 50,
  feetPerCell: 5,
  bgScale: 1,
  bgX: 0,
  bgY: 0,
};

export const TOKEN_COLORS = [
  "#2563eb",
  "#b91c1c",
  "#15803d",
  "#a16207",
  "#7c3aed",
  "#475569",
] as const;

export function emptyDoc(settings: Partial<MapSettings> = {}): MapDoc {
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    tokens: [],
    walls: [],
    doors: [],
    terrain: [],
    labels: [],
    fog: { enabled: false, revealed: [] },
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const same = (a: EdgeRef, b: EdgeRef) =>
  a.x === b.x && a.y === b.y && a.d === b.d;

export function edgeInBounds(doc: MapDoc, e: EdgeRef): boolean {
  const { cols, rows } = doc.settings;
  return e.d === "h"
    ? e.x >= 0 && e.x < cols && e.y >= 0 && e.y <= rows
    : e.x >= 0 && e.x <= cols && e.y >= 0 && e.y < rows;
}

export function cellInBounds(doc: MapDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.settings.cols && y < doc.settings.rows;
}

/** The grid edge nearest to a point given in cell units (fractions allowed). */
export function nearestEdge(
  fx: number,
  fy: number,
): EdgeRef & { distance: number } {
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const candidates: (EdgeRef & { distance: number })[] = [
    { x: cx, y: cy, d: "v", distance: fx - cx },
    { x: cx + 1, y: cy, d: "v", distance: cx + 1 - fx },
    { x: cx, y: cy, d: "h", distance: fy - cy },
    { x: cx, y: cy + 1, d: "h", distance: cy + 1 - fy },
  ];
  return candidates.reduce((a, b) => (b.distance < a.distance ? b : a));
}

/** Unit edges along the straight, axis-aligned line between two vertices. */
export function edgesAlong(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EdgeRef[] {
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const out: EdgeRef[] = [];
  if (horizontal) {
    for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++)
      out.push({ x, y: y1, d: "h" });
  } else {
    for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++)
      out.push({ x: x1, y, d: "v" });
  }
  return out;
}

export function addWalls(doc: MapDoc, edges: EdgeRef[]): MapDoc {
  let walls = doc.walls;
  let doors = doc.doors;
  for (const e of edges) {
    if (!edgeInBounds(doc, e)) continue;
    if (walls.some((w) => same(w, e))) continue;
    if (walls.length >= MAP_LIMITS.maxWalls) break;
    doors = doors.filter((d) => !same(d, e));
    walls = [...walls, { x: e.x, y: e.y, d: e.d }];
  }
  return walls === doc.walls && doors === doc.doors
    ? doc
    : { ...doc, walls, doors };
}

export function placeDoor(doc: MapDoc, e: EdgeRef): MapDoc {
  if (!edgeInBounds(doc, e)) return doc;
  if (doc.doors.some((d) => same(d, e))) return doc;
  if (doc.doors.length >= MAP_LIMITS.maxDoors) return doc;
  return {
    ...doc,
    walls: doc.walls.filter((w) => !same(w, e)),
    doors: [...doc.doors, { x: e.x, y: e.y, d: e.d, open: false }],
  };
}

export function toggleDoor(doc: MapDoc, e: EdgeRef): MapDoc {
  if (!doc.doors.some((d) => same(d, e))) return doc;
  return {
    ...doc,
    doors: doc.doors.map((d) => (same(d, e) ? { ...d, open: !d.open } : d)),
  };
}

export function eraseEdge(doc: MapDoc, e: EdgeRef): MapDoc {
  const walls = doc.walls.filter((w) => !same(w, e));
  const doors = doc.doors.filter((d) => !same(d, e));
  return walls.length === doc.walls.length && doors.length === doc.doors.length
    ? doc
    : { ...doc, walls, doors };
}

export function paintTerrain(
  doc: MapDoc,
  x: number,
  y: number,
  kind: TerrainKind,
): MapDoc {
  if (!cellInBounds(doc, x, y)) return doc;
  const existing = doc.terrain.find((c) => c.x === x && c.y === y);
  if (existing?.kind === kind) return doc;
  if (!existing && doc.terrain.length >= MAP_LIMITS.maxTerrain) return doc;
  return {
    ...doc,
    terrain: [...doc.terrain.filter((c) => c !== existing), { x, y, kind }],
  };
}

export function eraseTerrain(doc: MapDoc, x: number, y: number): MapDoc {
  const terrain = doc.terrain.filter((c) => !(c.x === x && c.y === y));
  return terrain.length === doc.terrain.length ? doc : { ...doc, terrain };
}

export function clampTokenPosition(
  doc: MapDoc,
  size: number,
  x: number,
  y: number,
) {
  return {
    x: clamp(x, 0, Math.max(0, doc.settings.cols - size)),
    y: clamp(y, 0, Math.max(0, doc.settings.rows - size)),
  };
}

export function addToken(
  doc: MapDoc,
  token: Omit<
    MapToken,
    "x" | "y" | "rotation" | "disposition" | "link" | "speed" | "dmOnly"
  > &
    Partial<
      Pick<
        MapToken,
        "x" | "y" | "rotation" | "disposition" | "link" | "speed" | "dmOnly"
      >
    >,
): MapDoc {
  if (doc.tokens.length >= MAP_LIMITS.maxTokens) return doc;
  const pos = clampTokenPosition(doc, token.size, token.x ?? 0, token.y ?? 0);
  return {
    ...doc,
    tokens: [
      ...doc.tokens,
      {
        rotation: 0,
        disposition: "neutral",
        link: null,
        speed: null,
        dmOnly: false,
        ...token,
        ...pos,
      },
    ],
  };
}

export function updateToken(
  doc: MapDoc,
  id: string,
  patch: Partial<Omit<MapToken, "id">>,
): MapDoc {
  return {
    ...doc,
    tokens: doc.tokens.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      if (patch.rotation !== undefined)
        next.rotation = ((Math.round(patch.rotation) % 360) + 360) % 360;
      return {
        ...next,
        ...clampTokenPosition(doc, next.size, next.x, next.y),
      };
    }),
  };
}

export function moveToken(
  doc: MapDoc,
  id: string,
  x: number,
  y: number,
): MapDoc {
  return updateToken(doc, id, { x, y });
}

export function rotateToken(doc: MapDoc, id: string, delta: number): MapDoc {
  const t = doc.tokens.find((k) => k.id === id);
  return t ? updateToken(doc, id, { rotation: t.rotation + delta }) : doc;
}

export function removeToken(doc: MapDoc, id: string): MapDoc {
  return { ...doc, tokens: doc.tokens.filter((t) => t.id !== id) };
}

/** Topmost token covering a cell; later tokens draw above earlier ones. */
export function tokenAt(doc: MapDoc, x: number, y: number): MapToken | null {
  for (let i = doc.tokens.length - 1; i >= 0; i--) {
    const t = doc.tokens[i];
    if (x >= t.x && x < t.x + t.size && y >= t.y && y < t.y + t.size) return t;
  }
  return null;
}

/** Changes the grid size, dropping anything that would fall outside it. */
export function updateSettings(
  doc: MapDoc,
  patch: Partial<MapSettings>,
): MapDoc {
  const settings = { ...doc.settings, ...patch };
  const next: MapDoc = { ...doc, settings };
  if (
    settings.cols === doc.settings.cols &&
    settings.rows === doc.settings.rows
  )
    return next;
  const { cols, rows } = settings;
  return {
    ...next,
    tokens: doc.tokens
      .filter((t) => t.size <= cols && t.size <= rows)
      .map((t) => ({
        ...t,
        x: Math.min(t.x, cols - t.size),
        y: Math.min(t.y, rows - t.size),
      })),
    walls: doc.walls.filter((w) => edgeInBounds(next, w)),
    doors: doc.doors.filter((d) => edgeInBounds(next, d)),
    terrain: doc.terrain.filter((c) => cellInBounds(next, c.x, c.y)),
    labels: doc.labels
      .filter((l) => l.x < cols && l.y < rows)
      .map((l) => ({
        ...l,
        w: Math.min(l.w, cols - l.x),
        h: Math.min(l.h, rows - l.y),
      })),
    fog: {
      ...doc.fog,
      revealed: doc.fog.revealed.filter((c) => cellInBounds(next, c.x, c.y)),
    },
  };
}

export function addLabel(
  doc: MapDoc,
  label: Omit<MapLabel, "dmOnly"> & { dmOnly?: boolean },
): MapDoc {
  if (doc.labels.length >= MAP_LIMITS.maxLabels) return doc;
  if (label.x < 0 || label.y < 0) return doc;
  if (label.x + label.w > doc.settings.cols) return doc;
  if (label.y + label.h > doc.settings.rows) return doc;
  return { ...doc, labels: [...doc.labels, { dmOnly: false, ...label }] };
}

export function updateLabel(
  doc: MapDoc,
  id: string,
  patch: Partial<Pick<MapLabel, "text" | "linkMapId" | "dmOnly">>,
): MapDoc {
  return {
    ...doc,
    labels: doc.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  };
}

export function removeLabel(doc: MapDoc, id: string): MapDoc {
  return { ...doc, labels: doc.labels.filter((l) => l.id !== id) };
}

/** The topmost (last-drawn) label covering a cell. */
export function labelAt(doc: MapDoc, x: number, y: number): MapLabel | null {
  for (let i = doc.labels.length - 1; i >= 0; i--) {
    const l = doc.labels[i];
    if (x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) return l;
  }
  return null;
}

export const DISPOSITION_COLORS = {
  ally: "#15803d",
  hostile: "#b91c1c",
  neutral: "#a16207",
} as const;

export type CombatantSeed = {
  id: string;
  name: string;
  side: "party" | "enemy" | "neutral";
};

/**
 * Adds a token for every combatant that is not already on the map. Allies fill
 * in from the left edge, enemies from the right, and neutrals from the middle.
 */
export function placeCombatantTokens(
  doc: MapDoc,
  combatants: CombatantSeed[],
  makeId: () => string,
): MapDoc {
  const { cols, rows } = doc.settings;
  const linked = new Set(
    doc.tokens.flatMap((t) =>
      t.link?.kind === "combatant" ? [t.link.id] : [],
    ),
  );
  const taken = new Set<string>();
  const markTaken = (t: MapToken) => {
    for (let dx = 0; dx < t.size; dx++)
      for (let dy = 0; dy < t.size; dy++) taken.add(`${t.x + dx}:${t.y + dy}`);
  };
  doc.tokens.forEach(markTaken);
  for (const c of doc.terrain)
    if (c.kind === "obstacle") taken.add(`${c.x}:${c.y}`);

  const nextFree = (side: CombatantSeed["side"]) => {
    const start = side === "neutral" ? Math.floor(cols / 2) : 0;
    for (let i = 0; i < cols; i++) {
      const x = side === "enemy" ? cols - 1 - i : (start + i) % cols;
      for (let y = 0; y < rows; y++)
        if (!taken.has(`${x}:${y}`)) return { x, y };
    }
    return null;
  };

  let next = doc;
  for (const c of combatants) {
    if (linked.has(c.id)) continue;
    const pos = nextFree(c.side);
    if (!pos || next.tokens.length >= MAP_LIMITS.maxTokens) break;
    const disposition =
      c.side === "party" ? "ally" : c.side === "enemy" ? "hostile" : "neutral";
    const before = next;
    next = addToken(next, {
      id: makeId(),
      label: c.name.slice(0, 40),
      size: 1,
      color: DISPOSITION_COLORS[disposition],
      shape: "circle",
      disposition,
      link: { kind: "combatant", id: c.id },
      ...pos,
    });
    if (next !== before) taken.add(`${pos.x}:${pos.y}`);
  }
  return next;
}

export function setFogEnabled(doc: MapDoc, enabled: boolean): MapDoc {
  return doc.fog.enabled === enabled
    ? doc
    : { ...doc, fog: { ...doc.fog, enabled } };
}

/** Reveals or hides a rectangle of cells (inclusive corners). */
export function setFogRect(
  doc: MapDoc,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  reveal: boolean,
): MapDoc {
  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(doc.settings.cols - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(doc.settings.rows - 1, Math.max(y1, y2));
  const inRect = (c: { x: number; y: number }) =>
    c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY;
  if (!reveal) {
    const kept = doc.fog.revealed.filter((c) => !inRect(c));
    return kept.length === doc.fog.revealed.length
      ? doc
      : { ...doc, fog: { ...doc.fog, revealed: kept } };
  }
  const have = new Set(doc.fog.revealed.map((c) => `${c.x}:${c.y}`));
  const added: { x: number; y: number }[] = [];
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      if (!have.has(`${x}:${y}`)) added.push({ x, y });
  if (!added.length) return doc;
  if (doc.fog.revealed.length + added.length > MAP_LIMITS.maxRevealed)
    return doc;
  return {
    ...doc,
    fog: { ...doc.fog, revealed: [...doc.fog.revealed, ...added] },
  };
}

export function revealAll(doc: MapDoc): MapDoc {
  return setFogRect(
    { ...doc, fog: { ...doc.fog, revealed: [] } },
    0,
    0,
    doc.settings.cols - 1,
    doc.settings.rows - 1,
    true,
  );
}

export function hideAll(doc: MapDoc): MapDoc {
  return doc.fog.revealed.length
    ? { ...doc, fog: { ...doc.fog, revealed: [] } }
    : doc;
}
