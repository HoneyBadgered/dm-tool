import { z } from "zod";

export const MAX_BOARD_NODES = 500;
export const MAX_BOARD_EDGES = 1500;
export const MAX_BOARD_ARCS = 30;
export const MAX_COORDINATE = 100_000;
export const MAX_BOARD_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_BOARD_IMAGES_BYTES = 50 * 1024 * 1024;

export const RECORD_KINDS = [
  "faction",
  "location",
  "quest",
  "clue",
  "event",
] as const;
export const NODE_STATUSES = ["confirmed", "possible", "retired"] as const;
export const EDGE_TYPES = [
  "ally",
  "enemy",
  "serves",
  "knows_secret",
  "reveals_clue",
  "causes_event",
  "plain",
] as const;
export const LINK_TYPES = [
  "npc",
  "player_character",
  "session",
  "encounter",
  "combat",
  ...RECORD_KINDS.map((k) => `record:${k}` as const),
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];
export type NodeStatus = (typeof NODE_STATUSES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EDGE_LABELS: Record<EdgeType, string> = {
  ally: "Allies",
  enemy: "Enemies",
  serves: "Serves",
  knows_secret: "Knows secret",
  reveals_clue: "Reveals clue",
  causes_event: "Causes event",
  plain: "Plain arrow (no text)",
};

export const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  faction: "Faction",
  location: "Location",
  quest: "Quest",
  clue: "Clue",
  event: "Event",
};

const id = z.string().trim().min(1, "Id is required").max(100);
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));
const coordinate = z.number().finite().min(-MAX_COORDINATE).max(MAX_COORDINATE);
const expectedVersion = z.number().int().min(0);

export const idSchema = id;

export const recordFields = {
  kind: z.enum(RECORD_KINDS),
  name: z.string().trim().min(1, "Name is required").max(120),
  summary: optionalText("Summary", 5000),
  dmNotes: optionalText("DM notes", 20_000),
};
export const recordCreateSchema = z.object({
  campaignId: id,
  ...recordFields,
});
export const recordUpdateSchema = z.object(recordFields);

export const boardCreateSchema = z.object({
  campaignId: id,
  name: z.string().trim().min(1, "Name is required").max(120),
});
export const boardRenameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const FREE_KINDS = [
  "text",
  "sticky",
  "shape",
  "frame",
  "image",
] as const;
export type FreeKind = (typeof FREE_KINDS)[number];
export const SHAPES = ["rect", "rounded", "ellipse", "diamond"] as const;
export type Shape = (typeof SHAPES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb color");

/** Appearance of free cards and arrows. Unknown keys are rejected. */
export const styleSchema = z
  .object({
    fill: z.union([hex, z.literal("none")]).optional(),
    border: hex.optional(),
    textColor: hex.optional(),
    borderWidth: z.number().int().min(0).max(12).optional(),
    fontSize: z.number().int().min(10).max(72).optional(),
    shape: z.enum(SHAPES).optional(),
    dashed: z.boolean().optional(),
  })
  .strict();
export type BoardStyle = z.infer<typeof styleSchema>;

const dimension = z.number().finite().min(20).max(5000);
const layer = z.number().int().min(-1000).max(1000);
const imageId = id.nullable().optional();

const base = { boardId: id, expectedVersion };

const nodePatch = {
  status: z.enum(NODE_STATUSES).optional(),
  dmNote: optionalText("DM note", 20_000).optional(),
  arcId: id.nullable().optional(),
  title: optionalText("Title", 120).optional(),
  text: optionalText("Text", 5000).optional(),
  style: styleSchema.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  zIndex: layer.optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
};

/** A full card, with a caller-chosen id so undo can restore it exactly. */
const nodeSpec = z.object({
  id,
  link: z
    .object({ type: z.enum(LINK_TYPES), id })
    .nullish()
    .transform((v) => v ?? null),
  kind: z.enum(["note", ...FREE_KINDS]).optional(),
  x: coordinate,
  y: coordinate,
  parentId: id.nullable().optional(),
  imageId,
  ...nodePatch,
});

const edgeSpec = z.object({
  id,
  sourceId: id,
  targetId: id,
  type: z.enum(EDGE_TYPES),
  label: optionalText("Label", 80),
  style: styleSchema.optional(),
});

export const boardCommands = {
  addNode: z.object({
    ...base,
    link: z
      .object({ type: z.enum(LINK_TYPES), id })
      .nullish()
      .transform((v) => v ?? null),
    kind: z.enum(["text", "sticky", "shape", "frame"]).optional(),
    title: optionalText("Title", 120),
    text: optionalText("Text", 5000),
    x: coordinate,
    y: coordinate,
    width: dimension.optional(),
    height: dimension.optional(),
    style: styleSchema.optional(),
  }),
  updateNode: z.object({
    ...base,
    nodeId: id,
    status: z.enum(NODE_STATUSES).optional(),
    dmNote: optionalText("DM note", 20_000).optional(),
    arcId: id.nullable().optional(),
    title: optionalText("Title", 120).optional(),
    text: optionalText("Text", 5000).optional(),
    style: styleSchema.optional(),
    width: dimension.optional(),
    height: dimension.optional(),
    zIndex: layer.optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
  moveNodes: z.object({
    ...base,
    positions: z
      .array(
        z.object({
          id,
          x: coordinate,
          y: coordinate,
          width: dimension.optional(),
          height: dimension.optional(),
          parentId: id.nullable().optional(),
        }),
      )
      .min(1)
      .max(MAX_BOARD_NODES),
    viewport: z
      .object({
        x: coordinate,
        y: coordinate,
        zoom: z.number().finite().min(0.05).max(4),
      })
      .optional(),
  }),
  removeNode: z.object({ ...base, nodeId: id }),
  addItems: z.object({
    ...base,
    nodes: z.array(nodeSpec).max(MAX_BOARD_NODES),
    edges: z.array(edgeSpec).max(MAX_BOARD_EDGES).default([]),
  }),
  removeItems: z.object({
    ...base,
    nodeIds: z.array(id).max(MAX_BOARD_NODES).default([]),
    edgeIds: z.array(id).max(MAX_BOARD_EDGES).default([]),
  }),
  updateNodes: z.object({
    ...base,
    patches: z
      .array(
        z.object({
          nodeId: id,
          ...nodePatch,
          replaceStyle: styleSchema.optional(),
        }),
      )
      .min(1)
      .max(MAX_BOARD_NODES),
  }),
  addEdge: z.object({
    ...base,
    sourceId: id,
    targetId: id,
    type: z.enum(EDGE_TYPES),
    label: optionalText("Label", 80),
  }),
  updateEdge: z.object({
    ...base,
    edgeId: id,
    type: z.enum(EDGE_TYPES).optional(),
    label: optionalText("Label", 80).optional(),
    style: styleSchema.optional(),
  }),
  removeEdge: z.object({ ...base, edgeId: id }),
  addArc: z.object({
    ...base,
    name: z.string().trim().min(1, "Name is required").max(80),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb color"),
  }),
  updateArc: z.object({
    ...base,
    arcId: id,
    name: z.string().trim().min(1).max(80).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  }),
  removeArc: z.object({ ...base, arcId: id }),
};
