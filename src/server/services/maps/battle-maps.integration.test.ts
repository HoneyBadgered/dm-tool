import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  addLabel,
  addToken,
  addWalls,
  edgesAlong,
  setFogEnabled,
  setFogRect,
} from "@/lib/battle-map-ops";
import {
  BattleMapConflictError,
  BattleMapImageError,
  BattleMapNotFoundError,
  CampaignNotFoundError,
  clearBattleMapBackground,
  createBattleMap,
  deleteBattleMap,
  getBattleMap,
  getBattleMapBackground,
  listBattleMaps,
  listParentMaps,
  renameBattleMap,
  saveBattleMap,
  setBattleMapBackground,
  setMapCombat,
} from "./battle-maps";
import {
  addCombatant,
  createAdHocCombat,
} from "@/server/services/combat/live-combat";
import { getCombatInfo } from "./map-links";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

describe.skipIf(!safe)("battle maps (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "Maps" } })).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("creates a map with defaults and rejects bad input", async () => {
    const { id } = await createBattleMap(
      { campaignId, name: " Cellar ", cols: 12, rows: 8 },
      db,
    );
    const map = await getBattleMap(id, db);
    expect(map).toMatchObject({ name: "Cellar", version: 0, background: null });
    expect(map!.doc.settings).toMatchObject({
      cols: 12,
      rows: 8,
      cellSize: 50,
      feetPerCell: 5,
    });
    await expect(
      createBattleMap({ campaignId, name: "  " }, db),
    ).rejects.toThrow();
    await expect(
      createBattleMap({ campaignId, name: "Big", cols: 1000 }, db),
    ).rejects.toThrow();
    await expect(
      createBattleMap({ campaignId: "nope", name: "X" }, db),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it("saves the whole document and bumps the version", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Save" }, db);
    let doc = (await getBattleMap(id, db))!.doc;
    doc = addToken(doc, {
      id: "t1",
      label: "Orc",
      size: 2,
      color: "#b91c1c",
      shape: "square",
      x: 3,
      y: 4,
    });
    doc = addWalls(doc, edgesAlong(0, 0, 4, 0));
    doc = {
      ...doc,
      settings: { ...doc.settings, cellSize: 70, feetPerCell: 10 },
    };
    expect(await saveBattleMap(id, { expectedVersion: 0, doc }, db)).toEqual({
      version: 1,
    });
    const reloaded = await getBattleMap(id, db);
    expect(reloaded!.version).toBe(1);
    expect(reloaded!.doc).toEqual(doc);
  });

  it("persists fog and DM-only flags, with fog off by default", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Fog" }, db);
    let doc = (await getBattleMap(id, db))!.doc;
    expect(doc.fog).toEqual({ enabled: false, revealed: [] });
    doc = addToken(doc, {
      id: "s",
      label: "Spy",
      size: 1,
      color: "#000000",
      shape: "circle",
      dmOnly: true,
    });
    doc = setFogRect(setFogEnabled(doc, true), 1, 1, 2, 2, true);
    await saveBattleMap(id, { expectedVersion: 0, doc }, db);
    const back = (await getBattleMap(id, db))!.doc;
    expect(back.fog.enabled).toBe(true);
    expect(back.fog.revealed).toHaveLength(4);
    expect(back.tokens[0].dmOnly).toBe(true);
  });

  it("rejects stale and invalid saves without changing the map", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Stale" }, db);
    const base = (await getBattleMap(id, db))!.doc;
    await saveBattleMap(id, { expectedVersion: 0, doc: base }, db);
    const edited = addToken(base, {
      id: "x",
      label: "",
      size: 1,
      color: "#000000",
      shape: "circle",
    });
    await expect(
      saveBattleMap(id, { expectedVersion: 0, doc: edited }, db),
    ).rejects.toBeInstanceOf(BattleMapConflictError);
    await expect(
      saveBattleMap(
        id,
        {
          expectedVersion: 1,
          doc: { ...edited, tokens: [{ ...edited.tokens[0], x: 999 }] },
        },
        db,
      ),
    ).rejects.toThrow();
    const after = await getBattleMap(id, db);
    expect(after!.version).toBe(1);
    expect(after!.doc.tokens).toEqual([]);
    await expect(
      saveBattleMap("nope", { expectedVersion: 0, doc: base }, db),
    ).rejects.toBeInstanceOf(BattleMapNotFoundError);
  });

  it("lets only one of two concurrent saves win", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Race" }, db);
    const doc = (await getBattleMap(id, db))!.doc;
    const results = await Promise.allSettled([
      saveBattleMap(id, { expectedVersion: 0, doc }, db),
      saveBattleMap(id, { expectedVersion: 0, doc }, db),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getBattleMap(id, db))!.version).toBe(1);
  });

  it("stores, serves, and clears a background image", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Image" }, db);
    const set = await setBattleMapBackground(
      id,
      { data: PNG, width: 800, height: 600 },
      db,
    );
    expect(set).toMatchObject({ rev: 1, mime: "image/png" });
    expect((await getBattleMap(id, db))!.background).toEqual({
      rev: 1,
      width: 800,
      height: 600,
    });
    const bg = await getBattleMapBackground(id, db);
    expect(bg!.mime).toBe("image/png");
    expect([...bg!.data]).toEqual([...PNG]);
    expect(
      (await listBattleMaps(campaignId, db)).find((m) => m.id === id)!
        .hasBackground,
    ).toBe(true);
    await clearBattleMapBackground(id, db);
    expect((await getBattleMap(id, db))!.background).toBeNull();
    expect(await getBattleMapBackground(id, db)).toBeNull();
  });

  it("refuses non-image, oversized, and unmeasured backgrounds", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Bad" }, db);
    const svg = new TextEncoder().encode("<svg onload='x'></svg>");
    await expect(
      setBattleMapBackground(id, { data: svg, width: 1, height: 1 }, db),
    ).rejects.toBeInstanceOf(BattleMapImageError);
    await expect(
      setBattleMapBackground(
        id,
        { data: new Uint8Array(5 * 1024 * 1024 + 1), width: 1, height: 1 },
        db,
      ),
    ).rejects.toBeInstanceOf(BattleMapImageError);
    await expect(
      setBattleMapBackground(id, { data: PNG, width: 0, height: 5 }, db),
    ).rejects.toBeInstanceOf(BattleMapImageError);
    expect((await getBattleMap(id, db))!.background).toBeNull();
  });

  it("renames, lists, and soft-deletes", async () => {
    const { id } = await createBattleMap({ campaignId, name: "Old" }, db);
    await renameBattleMap(id, " New ", db);
    expect((await getBattleMap(id, db))!.name).toBe("New");
    await expect(renameBattleMap(id, "", db)).rejects.toThrow();
    expect(
      (await listBattleMaps(campaignId, db)).some((m) => m.id === id),
    ).toBe(true);
    await deleteBattleMap(id, db);
    expect(await getBattleMap(id, db)).toBeNull();
    expect(
      (await listBattleMaps(campaignId, db)).some((m) => m.id === id),
    ).toBe(false);
    expect(await getBattleMapBackground(id, db)).toBeNull();
    await expect(deleteBattleMap(id, db)).rejects.toBeInstanceOf(
      BattleMapNotFoundError,
    );
  });

  it("keeps valid label links, drops foreign ones, and lists parents", async () => {
    const house = await createBattleMap(
      { campaignId, name: "House", cols: 20, rows: 20 },
      db,
    );
    const room = await createBattleMap({ campaignId, name: "Bedroom" }, db);
    const other = await db.campaign.create({ data: { name: "Other" } });
    const foreign = await createBattleMap(
      { campaignId: other.id, name: "Elsewhere" },
      db,
    );
    const base = (await getBattleMap(house.id, db))!;
    let doc = addLabel(base.doc, {
      id: "a",
      text: "Bedroom",
      x: 1,
      y: 1,
      w: 4,
      h: 3,
      linkMapId: room.id,
    });
    doc = addLabel(doc, {
      id: "b",
      text: "Secret",
      x: 6,
      y: 1,
      w: 2,
      h: 2,
      linkMapId: foreign.id,
    });
    await saveBattleMap(house.id, { expectedVersion: 0, doc }, db);
    const saved = (await getBattleMap(house.id, db))!;
    expect(saved.doc.labels.map((l) => l.linkMapId)).toEqual([room.id, null]);
    const parents = await listParentMaps(room.id, campaignId, db);
    expect(parents).toEqual([{ id: house.id, name: "House" }]);
    expect(await listParentMaps(house.id, campaignId, db)).toEqual([]);
  });

  it("attaches combats, reports live info, and sanitises token links", async () => {
    const other = await db.campaign.create({ data: { name: "Other" } });
    const map = await createBattleMap({ campaignId, name: "Arena" }, db);
    const { combatId } = await createAdHocCombat(
      { campaignId, name: "Brawl" },
      db,
    );
    const foreignCombat = await createAdHocCombat({ campaignId: other.id }, db);
    await expect(
      setMapCombat(map.id, foreignCombat.combatId, db),
    ).rejects.toThrow(BattleMapImageError);
    await setMapCombat(map.id, combatId, db);
    expect((await getBattleMap(map.id, db))!.combatId).toBe(combatId);

    const added = await addCombatant(
      {
        combatId,
        expectedVersion: 0,
        name: "Orc",
        side: "enemy",
        maxHp: 15,
        armorClass: 13,
      },
      db,
    );
    const info = (await getCombatInfo(combatId, campaignId, db))!;
    expect(info.combatants[0]).toMatchObject({
      name: "Orc",
      hp: 15,
      ac: 13,
      speed: null,
      effects: [],
    });
    expect(await getCombatInfo(combatId, other.id, db)).toBeNull();

    const npc = await db.npc.create({ data: { campaignId, name: "Mira" } });
    const foreignNpc = await db.npc.create({
      data: { campaignId: other.id, name: "Elsewhere" },
    });
    const base = (await getBattleMap(map.id, db))!;
    let doc = base.doc;
    const links = [
      { kind: "combatant" as const, id: added.combatantId },
      { kind: "combatant" as const, id: "nope" },
      { kind: "npc" as const, id: npc.id },
      { kind: "npc" as const, id: foreignNpc.id },
      { kind: "monster" as const, id: "missing" },
    ];
    links.forEach((link, i) => {
      doc = addToken(doc, {
        id: `t${i}`,
        label: `T${i}`,
        size: 1,
        color: "#000000",
        shape: "circle",
        link,
        x: i,
        y: 0,
      });
    });
    await saveBattleMap(map.id, { expectedVersion: 0, doc }, db);
    const saved = (await getBattleMap(map.id, db))!;
    expect(saved.doc.tokens.map((t) => t.link?.id ?? null)).toEqual([
      added.combatantId,
      null,
      npc.id,
      null,
      null,
    ]);

    await setMapCombat(map.id, null, db);
    await saveBattleMap(
      map.id,
      { expectedVersion: saved.version, doc: saved.doc },
      db,
    );
    const detached = (await getBattleMap(map.id, db))!;
    expect(detached.combatId).toBeNull();
    expect(detached.doc.tokens[0].link).toBeNull();
  });
});
