import { z } from "zod";

export const MAP_LIMITS = {
  minCells: 5,
  maxCols: 100,
  maxRows: 100,
  minCellSize: 20,
  maxCellSize: 200,
  maxFeetPerCell: 500,
  maxTokens: 200,
  maxWalls: 4000,
  maxDoors: 500,
  maxTerrain: 6000,
  maxLabels: 200,
  maxRevealed: 10_000,
  maxLabelText: 60,
  maxImageBytes: 5 * 1024 * 1024,
  maxImageDimension: 20_000,
  maxName: 120,
} as const;

export const TERRAIN_KINDS = ["difficult", "obstacle"] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];
export const TOKEN_SHAPES = ["circle", "square"] as const;
export const TOKEN_DISPOSITIONS = ["ally", "hostile", "neutral"] as const;
export type TokenDisposition = (typeof TOKEN_DISPOSITIONS)[number];
export const TOKEN_LINK_KINDS = [
  "combatant",
  "player_character",
  "npc",
  "monster",
] as const;
export type TokenLinkKind = (typeof TOKEN_LINK_KINDS)[number];
export type TokenShape = (typeof TOKEN_SHAPES)[number];

const mapId = z.string().trim().min(1, "Id is required").max(100);
export const battleMapIdSchema = mapId;

const itemId = z.string().min(1).max(40);
const cell = z.number().int().min(0).max(MAP_LIMITS.maxCols);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb color");

export const battleMapNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAP_LIMITS.maxName);

export const mapSettingsSchema = z.object({
  cols: z.number().int().min(MAP_LIMITS.minCells).max(MAP_LIMITS.maxCols),
  rows: z.number().int().min(MAP_LIMITS.minCells).max(MAP_LIMITS.maxRows),
  cellSize: z
    .number()
    .int()
    .min(MAP_LIMITS.minCellSize)
    .max(MAP_LIMITS.maxCellSize),
  feetPerCell: z.number().int().min(1).max(MAP_LIMITS.maxFeetPerCell),
  bgScale: z.number().finite().min(0.05).max(20),
  bgX: z.number().finite().min(-50_000).max(50_000),
  bgY: z.number().finite().min(-50_000).max(50_000),
});
export type MapSettings = z.infer<typeof mapSettingsSchema>;

export const tokenLinkSchema = z.object({
  kind: z.enum(TOKEN_LINK_KINDS),
  id: z.string().trim().min(1).max(100),
});
export type TokenLink = z.infer<typeof tokenLinkSchema>;

export const tokenSchema = z.object({
  id: itemId,
  label: z.string().trim().max(40),
  x: cell,
  y: cell,
  size: z.number().int().min(1).max(6),
  rotation: z.number().int().min(0).max(359),
  color: hexColor,
  shape: z.enum(TOKEN_SHAPES),
  disposition: z.enum(TOKEN_DISPOSITIONS).default("neutral"),
  link: tokenLinkSchema.nullable().default(null),
  dmOnly: z.boolean().default(false),
  /** Feet of movement used for the range overlay; null uses the linked record's speed. */
  speed: z
    .number()
    .int()
    .min(0)
    .max(MAP_LIMITS.maxFeetPerCell)
    .nullable()
    .default(null),
});
export type MapToken = z.infer<typeof tokenSchema>;

/** A single grid edge. "h" runs along the top of cell (x, y); "v" along its left. */
const edge = { x: cell, y: cell, d: z.enum(["h", "v"]) };
export const wallSchema = z.object(edge);
export type MapWall = z.infer<typeof wallSchema>;
export const doorSchema = z.object({ ...edge, open: z.boolean() });
export type MapDoor = z.infer<typeof doorSchema>;

export const terrainSchema = z.object({
  x: cell,
  y: cell,
  kind: z.enum(TERRAIN_KINDS),
});
export type MapTerrain = z.infer<typeof terrainSchema>;

export const labelSchema = z.object({
  id: itemId,
  text: z.string().trim().min(1).max(MAP_LIMITS.maxLabelText),
  x: cell,
  y: cell,
  w: z.number().int().min(1).max(MAP_LIMITS.maxCols),
  h: z.number().int().min(1).max(MAP_LIMITS.maxRows),
  linkMapId: mapId.nullable(),
  dmOnly: z.boolean().default(false),
});
export type MapLabel = z.infer<typeof labelSchema>;

export const fogSchema = z.object({
  enabled: z.boolean(),
  revealed: z.array(z.object({ x: cell, y: cell })).max(MAP_LIMITS.maxRevealed),
});
export type MapFog = z.infer<typeof fogSchema>;

export const mapDocSchema = z
  .object({
    settings: mapSettingsSchema,
    tokens: z.array(tokenSchema).max(MAP_LIMITS.maxTokens),
    walls: z.array(wallSchema).max(MAP_LIMITS.maxWalls),
    doors: z.array(doorSchema).max(MAP_LIMITS.maxDoors),
    terrain: z.array(terrainSchema).max(MAP_LIMITS.maxTerrain),
    labels: z.array(labelSchema).max(MAP_LIMITS.maxLabels).default([]),
    fog: fogSchema.default({ enabled: false, revealed: [] }),
  })
  .superRefine((doc, ctx) => {
    const { cols, rows } = doc.settings;
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = new Set<string>();
    for (const t of doc.tokens) {
      if (ids.has(t.id)) bad("Duplicate token id");
      ids.add(t.id);
      if (t.x + t.size > cols || t.y + t.size > rows)
        bad("A token is outside the grid");
    }
    const labelIds = new Set<string>();
    for (const l of doc.labels) {
      if (labelIds.has(l.id)) bad("Duplicate label id");
      labelIds.add(l.id);
      if (l.x + l.w > cols || l.y + l.h > rows)
        bad("A label is outside the grid");
    }
    const edges = new Set<string>();
    for (const e of [...doc.walls, ...doc.doors]) {
      const key = `${e.d}:${e.x}:${e.y}`;
      if (edges.has(key)) bad("Two walls or doors share an edge");
      edges.add(key);
      if (e.d === "h" ? e.x >= cols || e.y > rows : e.x > cols || e.y >= rows)
        bad("A wall or door is outside the grid");
    }
    const cells = new Set<string>();
    for (const c of doc.terrain) {
      const key = `${c.x}:${c.y}`;
      if (cells.has(key)) bad("A cell has more than one terrain type");
      cells.add(key);
      if (c.x >= cols || c.y >= rows) bad("Terrain is outside the grid");
    }
  });
export type MapDoc = z.infer<typeof mapDocSchema>;

export const mapSaveSchema = z.object({
  expectedVersion: z.number().int().min(0),
  doc: mapDocSchema,
});

export const mapCreateSchema = z.object({
  campaignId: mapId,
  name: battleMapNameSchema,
  cols: mapSettingsSchema.shape.cols.optional(),
  rows: mapSettingsSchema.shape.rows.optional(),
  cellSize: mapSettingsSchema.shape.cellSize.optional(),
  feetPerCell: mapSettingsSchema.shape.feetPerCell.optional(),
});

export const backgroundMetaSchema = z.object({
  width: z.number().int().min(1).max(MAP_LIMITS.maxImageDimension),
  height: z.number().int().min(1).max(MAP_LIMITS.maxImageDimension),
});

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

/** Identifies an image by its leading bytes; SVG and everything else is rejected. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  const at = (i: number) => bytes[i];
  if (
    bytes.length > 8 &&
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  )
    return "image/png";
  if (bytes.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
    return "image/jpeg";
  if (
    bytes.length > 12 &&
    String.fromCharCode(at(0), at(1), at(2), at(3)) === "RIFF" &&
    String.fromCharCode(at(8), at(9), at(10), at(11)) === "WEBP"
  )
    return "image/webp";
  return null;
}
