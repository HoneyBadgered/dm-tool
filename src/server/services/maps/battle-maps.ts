import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import { DEFAULT_SETTINGS, emptyDoc } from "@/lib/battle-map-ops";
import {
  MAP_LIMITS,
  backgroundMetaSchema,
  battleMapIdSchema,
  battleMapNameSchema,
  mapCreateSchema,
  mapDocSchema,
  mapSaveSchema,
  sniffImageMime,
  type ImageMime,
  type MapDoc,
} from "@/lib/validation/battle-map";
import { sanitizeTokenLinks } from "@/server/services/maps/map-links";
import { CampaignNotFoundError } from "@/server/services/campaigns/campaigns";

export { CampaignNotFoundError };

export type BattleMapDb = PrismaClient;

export class BattleMapNotFoundError extends Error {
  constructor(id: string) {
    super(`Map not found: ${id}`);
    this.name = "BattleMapNotFoundError";
  }
}

export class BattleMapConflictError extends Error {
  constructor() {
    super("The map changed elsewhere");
    this.name = "BattleMapConflictError";
  }
}

export class BattleMapImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BattleMapImageError";
  }
}

export type BattleMapSummary = {
  id: string;
  campaignId: string;
  name: string;
  cols: number;
  rows: number;
  hasBackground: boolean;
  updatedAt: Date;
};

export type BattleMapView = {
  id: string;
  campaignId: string;
  name: string;
  version: number;
  combatId: string | null;
  doc: MapDoc;
  background: { rev: number; width: number; height: number } | null;
};

const alive = { deletedAt: null } as const;

export async function listBattleMaps(
  campaignId: string,
  db: BattleMapDb = getDb(),
): Promise<BattleMapSummary[]> {
  const rows = await db.battleMap.findMany({
    where: { campaignId, ...alive },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      campaignId: true,
      name: true,
      cols: true,
      rows: true,
      bgWidth: true,
      updatedAt: true,
    },
  });
  return rows.map(({ bgWidth, ...r }) => ({
    ...r,
    hasBackground: bgWidth !== null,
  }));
}

export async function createBattleMap(
  input: unknown,
  db: BattleMapDb = getDb(),
): Promise<{ id: string }> {
  const { campaignId, name, ...grid } = mapCreateSchema.parse(input);
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, ...alive },
    select: { id: true },
  });
  if (!campaign) throw new CampaignNotFoundError(campaignId);
  const settings = { ...DEFAULT_SETTINGS, ...stripUndefined(grid) };
  const { tokens, walls, doors, terrain, labels, fog } = emptyDoc(settings);
  return db.battleMap.create({
    data: {
      campaignId,
      name,
      cols: settings.cols,
      rows: settings.rows,
      cellSize: settings.cellSize,
      feetPerCell: settings.feetPerCell,
      state: { tokens, walls, doors, terrain, labels, fog },
    },
    select: { id: true },
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export async function getBattleMap(
  id: string,
  db: BattleMapDb = getDb(),
): Promise<BattleMapView | null> {
  const row = await db.battleMap.findFirst({
    where: { id: battleMapIdSchema.parse(id), ...alive },
    select: {
      id: true,
      campaignId: true,
      name: true,
      version: true,
      combatId: true,
      cols: true,
      rows: true,
      cellSize: true,
      feetPerCell: true,
      bgScale: true,
      bgX: true,
      bgY: true,
      bgRev: true,
      bgWidth: true,
      bgHeight: true,
      state: true,
    },
  });
  if (!row) return null;
  const state =
    row.state && typeof row.state === "object" && !Array.isArray(row.state)
      ? (row.state as Record<string, unknown>)
      : {};
  const settings = {
    cols: row.cols,
    rows: row.rows,
    cellSize: row.cellSize,
    feetPerCell: row.feetPerCell,
    bgScale: row.bgScale,
    bgX: row.bgX,
    bgY: row.bgY,
  };
  const parsed = mapDocSchema.safeParse({
    settings,
    tokens: state.tokens ?? [],
    walls: state.walls ?? [],
    doors: state.doors ?? [],
    terrain: state.terrain ?? [],
    labels: state.labels ?? [],
    fog: state.fog ?? undefined,
  });
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    version: row.version,
    combatId: row.combatId,
    doc: parsed.success ? parsed.data : emptyDoc(settings),
    background:
      row.bgWidth && row.bgHeight
        ? { rev: row.bgRev, width: row.bgWidth, height: row.bgHeight }
        : null,
  };
}

/** Drops label links that point outside this map's campaign or at deleted maps. */
async function validLabelLinks(
  mapId: string,
  labels: MapDoc["labels"],
  db: BattleMapDb,
): Promise<MapDoc["labels"]> {
  const wanted = [
    ...new Set(labels.flatMap((l) => (l.linkMapId ? [l.linkMapId] : []))),
  ];
  if (!wanted.length) return labels;
  const self = await db.battleMap.findFirst({
    where: { id: mapId, ...alive },
    select: { campaignId: true },
  });
  if (!self) return labels;
  const found = await db.battleMap.findMany({
    where: { id: { in: wanted }, campaignId: self.campaignId, ...alive },
    select: { id: true },
  });
  const ok = new Set(found.map((m) => m.id));
  return labels.map((l) =>
    l.linkMapId && ok.has(l.linkMapId) ? l : { ...l, linkMapId: null },
  );
}

/** Maps in the same campaign whose labels link to this one. */
export async function listParentMaps(
  id: string,
  campaignId: string,
  db: BattleMapDb = getDb(),
): Promise<{ id: string; name: string }[]> {
  const rows = await db.battleMap.findMany({
    where: { campaignId, id: { not: id }, ...alive },
    orderBy: { name: "asc" },
    select: { id: true, name: true, state: true },
  });
  return rows
    .filter((r) => {
      const labels =
        r.state && typeof r.state === "object" && !Array.isArray(r.state)
          ? (r.state as Record<string, unknown>).labels
          : null;
      return (
        Array.isArray(labels) &&
        labels.some(
          (l) =>
            l &&
            typeof l === "object" &&
            (l as { linkMapId?: unknown }).linkMapId === id,
        )
      );
    })
    .map(({ id, name }) => ({ id, name }));
}

/** Saves the whole map document if nobody else saved since `expectedVersion`. */
export async function saveBattleMap(
  id: string,
  input: unknown,
  db: BattleMapDb = getDb(),
): Promise<{ version: number }> {
  const mapId = battleMapIdSchema.parse(id);
  const { expectedVersion, doc } = mapSaveSchema.parse(input);
  const { settings, walls, doors, terrain, fog } = doc;
  const labels = await validLabelLinks(mapId, doc.labels, db);
  const self = await db.battleMap.findFirst({
    where: { id: mapId, ...alive },
    select: { campaignId: true, combatId: true },
  });
  const tokens = self
    ? await sanitizeTokenLinks(doc.tokens, self.campaignId, self.combatId, db)
    : doc.tokens;
  const result = await db.battleMap.updateMany({
    where: { id: mapId, version: expectedVersion, ...alive },
    data: {
      cols: settings.cols,
      rows: settings.rows,
      cellSize: settings.cellSize,
      feetPerCell: settings.feetPerCell,
      bgScale: settings.bgScale,
      bgX: settings.bgX,
      bgY: settings.bgY,
      state: { tokens, walls, doors, terrain, labels, fog },
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const exists = await db.battleMap.findFirst({
      where: { id: mapId, ...alive },
      select: { id: true },
    });
    throw exists
      ? new BattleMapConflictError()
      : new BattleMapNotFoundError(id);
  }
  return { version: expectedVersion + 1 };
}

/** Attaches an unfinished combat from the same campaign, or detaches with null. */
export async function setMapCombat(
  id: string,
  combatId: string | null,
  db: BattleMapDb = getDb(),
): Promise<void> {
  const mapId = battleMapIdSchema.parse(id);
  const map = await db.battleMap.findFirst({
    where: { id: mapId, ...alive },
    select: { campaignId: true },
  });
  if (!map) throw new BattleMapNotFoundError(id);
  if (combatId !== null) {
    const combat = await db.combat.findFirst({
      where: {
        id: battleMapIdSchema.parse(combatId),
        campaignId: map.campaignId,
        status: { not: "ended" },
        campaign: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!combat) throw new BattleMapImageError("That combat is not available");
  }
  await db.battleMap.update({ where: { id: mapId }, data: { combatId } });
}

export async function renameBattleMap(
  id: string,
  name: unknown,
  db: BattleMapDb = getDb(),
): Promise<void> {
  const result = await db.battleMap.updateMany({
    where: { id: battleMapIdSchema.parse(id), ...alive },
    data: { name: battleMapNameSchema.parse(name) },
  });
  if (result.count === 0) throw new BattleMapNotFoundError(id);
}

/** Soft delete. */
export async function deleteBattleMap(
  id: string,
  db: BattleMapDb = getDb(),
): Promise<void> {
  const result = await db.battleMap.updateMany({
    where: { id: battleMapIdSchema.parse(id), ...alive },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new BattleMapNotFoundError(id);
}

export async function setBattleMapBackground(
  id: string,
  image: { data: Uint8Array; width: unknown; height: unknown },
  db: BattleMapDb = getDb(),
): Promise<{ rev: number; width: number; height: number; mime: ImageMime }> {
  const mapId = battleMapIdSchema.parse(id);
  if (image.data.byteLength > MAP_LIMITS.maxImageBytes)
    throw new BattleMapImageError("The image is larger than 5 MB.");
  const mime = sniffImageMime(image.data);
  if (!mime) throw new BattleMapImageError("Use a PNG, JPEG, or WebP image.");
  const meta = backgroundMetaSchema.safeParse({
    width: image.width,
    height: image.height,
  });
  if (!meta.success)
    throw new BattleMapImageError("The image size could not be read.");
  const current = await db.battleMap.findFirst({
    where: { id: mapId, ...alive },
    select: { bgRev: true },
  });
  if (!current) throw new BattleMapNotFoundError(id);
  const rev = current.bgRev + 1;
  const result = await db.battleMap.updateMany({
    where: { id: mapId, bgRev: current.bgRev, ...alive },
    data: {
      bgMime: mime,
      bgData: Buffer.from(image.data),
      bgWidth: meta.data.width,
      bgHeight: meta.data.height,
      bgRev: rev,
    },
  });
  if (result.count === 0) throw new BattleMapConflictError();
  return { rev, mime, ...meta.data };
}

export async function clearBattleMapBackground(
  id: string,
  db: BattleMapDb = getDb(),
): Promise<void> {
  const result = await db.battleMap.updateMany({
    where: { id: battleMapIdSchema.parse(id), ...alive },
    data: {
      bgMime: null,
      bgData: null,
      bgWidth: null,
      bgHeight: null,
      bgRev: { increment: 1 },
    },
  });
  if (result.count === 0) throw new BattleMapNotFoundError(id);
}

export async function getBattleMapBackground(
  id: string,
  db: BattleMapDb = getDb(),
): Promise<{ mime: string; data: Uint8Array; rev: number } | null> {
  const row = await db.battleMap.findFirst({
    where: { id: battleMapIdSchema.parse(id), ...alive },
    select: { bgMime: true, bgData: true, bgRev: true },
  });
  if (!row?.bgData || !row.bgMime) return null;
  return { mime: row.bgMime, data: row.bgData, rev: row.bgRev };
}
