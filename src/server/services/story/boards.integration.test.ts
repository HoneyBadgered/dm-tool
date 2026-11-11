import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { boardCommands } from "@/lib/validation/board";
import {
  BoardConflictError,
  BoardRuleError,
  applyBoardCommand,
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
} from "./boards";
import {
  BoardImageError,
  createBoardImage,
  getBoardImage,
} from "./board-images";
import { createRecord, deleteRecord } from "./records";
import {
  quickCreateForBoard,
  updateClueTextForBoard,
  updateCardNotesForBoard,
} from "./board-quick-create";
import {
  addCreatureForBoard,
  getBoardEncounter,
  removeCreatureForBoard,
} from "./board-encounter";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe("board command validation", () => {
  it("rejects bad edge types, colors, and coordinates", () => {
    const base = { boardId: "b", expectedVersion: 0 };
    expect(
      boardCommands.addEdge.safeParse({
        ...base,
        sourceId: "a",
        targetId: "b",
        type: "friends",
      }).success,
    ).toBe(false);
    expect(
      boardCommands.addArc.safeParse({ ...base, name: "x", color: "red" })
        .success,
    ).toBe(false);
    expect(
      boardCommands.addNode.safeParse({ ...base, x: 1e9, y: 0, title: "t" })
        .success,
    ).toBe(false);
  });
});

describe.skipIf(!safe)("campaign boards (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let otherCampaignId: string;
  let boardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "Board" } })).id;
    otherCampaignId = (await db.campaign.create({ data: { name: "Other" } }))
      .id;
    boardId = (await createBoard({ campaignId, name: "Main" }, db)).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("saves and reloads cards, arrows, arcs, and viewport", async () => {
    const npc = await db.npc.create({
      data: {
        campaignId,
        name: "Mira",
        role: "Innkeeper",
        location: "Dunmere",
      },
    });
    const rec = await createRecord(
      { campaignId, kind: "faction", name: "Guild" },
      db,
    );
    let v = 0;
    const a = await applyBoardCommand(
      "addNode",
      {
        boardId,
        expectedVersion: v++,
        link: { type: "npc", id: npc.id },
        x: 10,
        y: 20,
      },
      db,
    );
    const b = await applyBoardCommand(
      "addNode",
      {
        boardId,
        expectedVersion: v++,
        link: { type: "record:faction", id: rec.id },
        x: 300,
        y: 20,
      },
      db,
    );
    const arc = await applyBoardCommand(
      "addArc",
      { boardId, expectedVersion: v++, name: "Heist", color: "#aa3300" },
      db,
    );
    await applyBoardCommand(
      "updateNode",
      {
        boardId,
        expectedVersion: v++,
        nodeId: a.id,
        status: "possible",
        dmNote: "secret",
        arcId: arc.id,
      },
      db,
    );
    await applyBoardCommand(
      "addEdge",
      {
        boardId,
        expectedVersion: v++,
        sourceId: a.id,
        targetId: b.id,
        type: "serves",
      },
      db,
    );
    await applyBoardCommand(
      "moveNodes",
      {
        boardId,
        expectedVersion: v++,
        positions: [{ id: a.id, x: 50, y: 60 }],
        viewport: { x: 5, y: 6, zoom: 1.5 },
      },
      db,
    );

    const view = (await getBoard(boardId, db))!;
    expect(view.version).toBe(v);
    expect(view.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    const node = view.nodes.find((n) => n.id === a.id)!;
    expect([node.x, node.y, node.status, node.dmNote]).toEqual([
      50,
      60,
      "possible",
      "secret",
    ]);
    expect(node.link?.label).toBe("Mira");
    expect(node.detail).toBe("Innkeeper · Dunmere");
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0].type).toBe("serves");
  });

  it("rejects stale saves without changing the board", async () => {
    const before = (await getBoard(boardId, db))!;
    await expect(
      applyBoardCommand(
        "addNode",
        {
          boardId,
          expectedVersion: before.version - 1,
          title: "Late",
          x: 0,
          y: 0,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(BoardConflictError);
    const after = (await getBoard(boardId, db))!;
    expect(after.version).toBe(before.version);
    expect(after.nodes).toHaveLength(before.nodes.length);
  });

  it("lets only one of two concurrent saves win", async () => {
    const { version } = (await getBoard(boardId, db))!;
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        applyBoardCommand(
          "addNode",
          { boardId, expectedVersion: version, title: `n${n}`, x: n, y: n },
          db,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects links to records in another campaign and self arrows", async () => {
    const foreign = await db.npc.create({
      data: { campaignId: otherCampaignId, name: "Foreign" },
    });
    let { version } = (await getBoard(boardId, db))!;
    await expect(
      applyBoardCommand(
        "addNode",
        {
          boardId,
          expectedVersion: version,
          link: { type: "npc", id: foreign.id },
          x: 0,
          y: 0,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(BoardRuleError);
    version = (await getBoard(boardId, db))!.version;
    const n = (await getBoard(boardId, db))!.nodes[0];
    await expect(
      applyBoardCommand(
        "addEdge",
        {
          boardId,
          expectedVersion: version,
          sourceId: n.id,
          targetId: n.id,
          type: "ally",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(BoardRuleError);
  });

  it("stores a plain arrow with no label", async () => {
    const boardId = (await createBoard({ campaignId, name: "Plain" }, db)).id;
    const mk = async (x: number) => {
      const v = (await getBoard(boardId, db))!.version;
      await applyBoardCommand(
        "addNode",
        { boardId, expectedVersion: v, title: "P", x, y: 0 },
        db,
      );
    };
    await mk(500);
    await mk(700);
    const nodes = (await getBoard(boardId, db))!.nodes.slice(-2);
    const v = (await getBoard(boardId, db))!.version;
    await applyBoardCommand(
      "addEdge",
      {
        boardId,
        expectedVersion: v,
        sourceId: nodes[0].id,
        targetId: nodes[1].id,
        type: "plain",
      },
      db,
    );
    const edge = (await getBoard(boardId, db))!.edges.find(
      (e) => e.type === "plain",
    );
    expect(edge?.label).toBeNull();
  });

  it("shows a missing card when a linked record is deleted", async () => {
    const rec = await createRecord(
      { campaignId, kind: "clue", name: "Torn map" },
      db,
    );
    const { version } = (await getBoard(boardId, db))!;
    const added = await applyBoardCommand(
      "addNode",
      {
        boardId,
        expectedVersion: version,
        link: { type: "record:clue", id: rec.id },
        x: 0,
        y: 0,
      },
      db,
    );
    await deleteRecord(rec.id, db);
    const node = (await getBoard(boardId, db))!.nodes.find(
      (n) => n.id === added.id,
    )!;
    expect(node.link?.missing).toBe(true);
  });

  it("removing a card removes its arrows; boards soft delete", async () => {
    const view = (await getBoard(boardId, db))!;
    const withEdge = view.edges[0];
    await applyBoardCommand(
      "removeNode",
      { boardId, expectedVersion: view.version, nodeId: withEdge.sourceId },
      db,
    );
    expect((await getBoard(boardId, db))!.edges).toHaveLength(0);

    expect((await listBoards(campaignId, db)).map((b) => b.id)).toContain(
      boardId,
    );
    await deleteBoard(boardId, db);
    expect(await getBoard(boardId, db)).toBeNull();
  });
});

describe("board styling validation", () => {
  const base = { boardId: "b", expectedVersion: 0, x: 0, y: 0 };
  it("accepts free kinds and rejects unknown or bad style values", () => {
    expect(
      boardCommands.addNode.safeParse({
        ...base,
        kind: "sticky",
        style: { fill: "#ffee00", borderWidth: 3 },
      }).success,
    ).toBe(true);
    expect(
      boardCommands.addNode.safeParse({
        ...base,
        kind: "sticky",
        style: { fill: "red" },
      }).success,
    ).toBe(false);
    expect(
      boardCommands.addNode.safeParse({
        ...base,
        kind: "sticky",
        style: { evil: 1 },
      }).success,
    ).toBe(false);
    expect(
      boardCommands.addNode.safeParse({
        ...base,
        kind: "sticky",
        style: { borderWidth: 99 },
      }).success,
    ).toBe(false);
    expect(
      boardCommands.addNode.safeParse({ ...base, kind: "bogus" }).success,
    ).toBe(false);
  });
});

describe.skipIf(!safe)("free-form board elements (integration)", () => {
  let db: PrismaClient;
  let boardId: string;
  let otherBoardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const c = await db.campaign.create({ data: { name: "Free" } });
    boardId = (await createBoard({ campaignId: c.id, name: "A" }, db)).id;
    otherBoardId = (await createBoard({ campaignId: c.id, name: "B" }, db)).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  const run = async (
    name: Parameters<typeof applyBoardCommand>[0],
    input: Record<string, unknown>,
  ) => {
    const v = (await getBoard(boardId, db))!.version;
    return applyBoardCommand(
      name,
      { boardId, expectedVersion: v, ...input } as never,
      db,
    );
  };

  it("stores size and style, merges style updates, and reloads them", async () => {
    const r = await run("addNode", {
      kind: "shape",
      x: 5,
      y: 6,
      width: 200,
      height: 90,
      style: { fill: "#112233", shape: "ellipse" },
    });
    await run("updateNode", {
      nodeId: r.id,
      style: { borderWidth: 4 },
      text: "hello",
    });
    const n = (await getBoard(boardId, db))!.nodes.find((x) => x.id === r.id)!;
    expect(n).toMatchObject({
      kind: "shape",
      width: 200,
      height: 90,
      text: "hello",
    });
    expect(n.style).toEqual({
      fill: "#112233",
      shape: "ellipse",
      borderWidth: 4,
    });
  });

  it("parents nodes to frames, rejects nesting and cross-board parents", async () => {
    const f = await run("addNode", {
      kind: "frame",
      title: "Act 1",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    });
    const f2 = await run("addNode", {
      kind: "frame",
      title: "Act 2",
      x: 500,
      y: 0,
    });
    const s = await run("addNode", {
      kind: "sticky",
      text: "idea",
      x: 10,
      y: 10,
    });
    await run("moveNodes", {
      positions: [{ id: s.id, x: 10, y: 10, parentId: f.id }],
    });
    const view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((x) => x.id === s.id)!.parentId).toBe(f.id);
    expect(view.nodes.find((x) => x.id === f.id)!.zIndex).toBeLessThan(0);

    await expect(
      run("moveNodes", {
        positions: [{ id: f2.id, x: 0, y: 0, parentId: f.id }],
      }),
    ).rejects.toBeInstanceOf(BoardRuleError);
    await expect(
      run("moveNodes", {
        positions: [{ id: s.id, x: 0, y: 0, parentId: s.id }],
      }),
    ).rejects.toBeInstanceOf(BoardRuleError);

    const foreign = (await applyBoardCommand(
      "addNode",
      {
        boardId: otherBoardId,
        expectedVersion: 0,
        kind: "frame",
        title: "X",
        x: 0,
        y: 0,
      } as never,
      db,
    ))!;
    await expect(
      run("moveNodes", {
        positions: [{ id: s.id, x: 0, y: 0, parentId: foreign.id }],
      }),
    ).rejects.toBeInstanceOf(BoardRuleError);

    // Deleting a frame leaves its children on the board, detached.
    await run("removeNode", { nodeId: f.id });
    const after = (await getBoard(boardId, db))!.nodes.find(
      (x) => x.id === s.id,
    )!;
    expect(after.parentId).toBeNull();
  });

  it("persists edge style", async () => {
    const a = await run("addNode", { kind: "text", text: "a", x: 0, y: 0 });
    const b = await run("addNode", { kind: "text", text: "b", x: 100, y: 0 });
    const e = await run("addEdge", {
      sourceId: a.id,
      targetId: b.id,
      type: "ally",
    });
    await run("updateEdge", {
      edgeId: e.id,
      style: { dashed: true, borderWidth: 5 },
    });
    const edge = (await getBoard(boardId, db))!.edges.find(
      (x) => x.id === e.id,
    )!;
    expect(edge.style).toEqual({ dashed: true, borderWidth: 5 });
  });
});

describe.skipIf(!safe)("batch board commands (integration)", () => {
  let db: PrismaClient;
  let boardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const c = await db.campaign.create({ data: { name: "Batch" } });
    boardId = (await createBoard({ campaignId: c.id, name: "A" }, db)).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  const run = async (
    name: Parameters<typeof applyBoardCommand>[0],
    input: object,
  ) => {
    const v = (await getBoard(boardId, db))!.version;
    return applyBoardCommand(
      name,
      { boardId, expectedVersion: v, ...input } as never,
      db,
    );
  };
  const spec = (id: string, extra: object = {}) => ({
    id,
    kind: "sticky",
    text: id,
    x: 1,
    y: 2,
    ...extra,
  });

  it("restores deleted cards and arrows with the same ids (undo of delete)", async () => {
    await run("addItems", {
      nodes: [
        spec("bn1", { style: { fill: "none" }, locked: true, zIndex: 4 }),
        spec("bn2"),
      ],
      edges: [
        {
          id: "be1",
          sourceId: "bn1",
          targetId: "bn2",
          type: "ally",
          style: { dashed: true },
        },
      ],
    });
    let view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((n) => n.id === "bn1")).toMatchObject({
      locked: true,
      zIndex: 4,
      style: { fill: "none" },
    });
    expect(view.edges[0]).toMatchObject({ id: "be1", style: { dashed: true } });

    await run("removeItems", { nodeIds: ["bn1"], edgeIds: [] });
    view = (await getBoard(boardId, db))!;
    expect(view.nodes.map((n) => n.id)).toEqual(["bn2"]);
    expect(view.edges).toHaveLength(0);

    await run("addItems", { nodes: [spec("bn1")], edges: [] });
    expect((await getBoard(boardId, db))!.nodes).toHaveLength(2);
  });

  it("is atomic: a bad item rolls back the whole batch, and ids can't collide", async () => {
    const before = (await getBoard(boardId, db))!.nodes.length;
    await expect(
      run("addItems", { nodes: [spec("ok1"), spec("bn2")], edges: [] }),
    ).rejects.toBeTruthy();
    expect((await getBoard(boardId, db))!.nodes).toHaveLength(before);
    await expect(
      run("addItems", {
        nodes: [spec("self")],
        edges: [{ id: "x", sourceId: "self", targetId: "self", type: "ally" }],
      }),
    ).rejects.toBeInstanceOf(BoardRuleError);
  });

  it("keeps cards when a frame is removed in a batch, and drops stale parents on restore", async () => {
    await run("addItems", {
      nodes: [
        spec("fr", { kind: "frame", width: 300, height: 200 }),
        spec("kid", { parentId: "fr" }),
        spec("lost", { parentId: "does-not-exist" }),
      ],
    });
    let view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((n) => n.id === "kid")!.parentId).toBe("fr");
    expect(view.nodes.find((n) => n.id === "lost")!.parentId).toBeNull();
    await run("removeItems", { nodeIds: ["fr"], edgeIds: [] });
    view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((n) => n.id === "kid")!.parentId).toBeNull();
  });

  it("updates many cards at once and can replace (not merge) a style", async () => {
    await run("updateNodes", {
      patches: [
        { nodeId: "bn1", hidden: true, style: { border: "#112233" } },
        { nodeId: "bn2", zIndex: 7, locked: true },
      ],
    });
    let view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((n) => n.id === "bn1")).toMatchObject({
      hidden: true,
      style: { border: "#112233" },
    });
    expect(view.nodes.find((n) => n.id === "bn2")).toMatchObject({
      zIndex: 7,
      locked: true,
    });
    await run("updateNodes", {
      patches: [{ nodeId: "bn1", hidden: false, replaceStyle: {} }],
    });
    view = (await getBoard(boardId, db))!;
    expect(view.nodes.find((n) => n.id === "bn1")).toMatchObject({
      hidden: false,
      style: {},
    });
  });
});

describe.skipIf(!safe)("pasted board images (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let otherCampaignId: string;
  let boardId: string;
  let otherBoardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "Image board" } }))
      .id;
    otherCampaignId = (
      await db.campaign.create({ data: { name: "Other image board" } })
    ).id;
    boardId = (await createBoard({ campaignId, name: "Main" }, db)).id;
    otherBoardId = (
      await createBoard({ campaignId: otherCampaignId, name: "Other" }, db)
    ).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("stores image bytes safely and supports same-campaign copy/undo data", async () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    const created = await createBoardImage(
      boardId,
      {
        expectedVersion: 0,
        x: 10,
        y: 20,
        width: 320,
        height: 240,
        title: "Map sketch",
      },
      pngHeader,
      db,
    );
    expect(await getBoardImage(created.imageId, db)).toEqual({
      mime: "image/png",
      data: pngHeader,
    });
    expect(await getBoard(boardId, db)).toMatchObject({
      nodes: [
        {
          kind: "image",
          imageId: created.imageId,
          imageUrl: `/api/boards/images/${created.imageId}`,
        },
      ],
    });

    await applyBoardCommand(
      "addItems",
      {
        boardId,
        expectedVersion: 1,
        nodes: [
          {
            id: "image-copy",
            kind: "image",
            imageId: created.imageId,
            link: null,
            x: 400,
            y: 20,
            title: "Map sketch copy",
            text: null,
            dmNote: null,
            status: "confirmed",
            arcId: null,
            zIndex: 0,
            locked: false,
            hidden: false,
            parentId: null,
          },
        ],
        edges: [],
      },
      db,
    );
    expect(
      (await getBoard(boardId, db))?.nodes.filter((n) => n.kind === "image"),
    ).toHaveLength(2);
    await expect(
      applyBoardCommand(
        "addItems",
        {
          boardId: otherBoardId,
          expectedVersion: 0,
          nodes: [
            {
              id: "foreign-image",
              kind: "image",
              imageId: created.imageId,
              link: null,
              x: 0,
              y: 0,
              status: "confirmed",
              arcId: null,
              zIndex: 0,
              locked: false,
              hidden: false,
              parentId: null,
            },
          ],
          edges: [],
        },
        db,
      ),
    ).rejects.toBeInstanceOf(BoardRuleError);
  });

  it("rejects unsupported image formats", async () => {
    await expect(
      createBoardImage(
        boardId,
        { expectedVersion: 0, x: 0, y: 0, width: 100, height: 100 },
        new Uint8Array([1, 2, 3]),
        db,
      ),
    ).rejects.toBeInstanceOf(BoardImageError);
  });
});

describe("no-fill and batch validation", () => {
  it("allows fill none but not arbitrary strings", () => {
    const base = {
      boardId: "b",
      expectedVersion: 0,
      x: 0,
      y: 0,
      kind: "shape",
    };
    expect(
      boardCommands.addNode.safeParse({ ...base, style: { fill: "none" } })
        .success,
    ).toBe(true);
    expect(
      boardCommands.addNode.safeParse({
        ...base,
        style: { fill: "transparent" },
      }).success,
    ).toBe(false);
  });
});

describe.skipIf(!safe)("encounter and combat cards (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let otherId: string;
  let boardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "EC" } })).id;
    otherId = (await db.campaign.create({ data: { name: "EC other" } })).id;
    boardId = (await createBoard({ campaignId, name: "EC board" }, db)).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("links an encounter and a combat, showing live context", async () => {
    const enc = await db.encounter.create({
      data: { campaignId, title: "Bridge ambush", objective: "Cross alive" },
    });
    const combat = await db.combat.create({
      data: {
        campaignId,
        encounterId: enc.id,
        status: "running",
        round: 3,
      },
    });
    let v = 0;
    for (const link of [
      { type: "encounter", id: enc.id },
      { type: "combat", id: combat.id },
    ]) {
      await applyBoardCommand(
        "addNode",
        { boardId, expectedVersion: v++, link, x: 0, y: 0 },
        db,
      );
    }
    const view = await getBoard(boardId, db);
    const links = view!.nodes.map((n) => n.link);
    expect(links).toMatchObject([
      { type: "encounter", label: "Bridge ambush", missing: false },
      { type: "combat", label: "Combat: Bridge ambush", missing: false },
    ]);
    expect(view!.nodes[0].detail).toContain("Cross alive");
    expect(view!.nodes[1].detail).toBe("running · Round 3");
  });

  it("rejects items from another campaign", async () => {
    const enc = await db.encounter.create({
      data: { campaignId: otherId, title: "Elsewhere" },
    });
    const combat = await db.combat.create({ data: { campaignId: otherId } });
    const view = await getBoard(boardId, db);
    for (const link of [
      { type: "encounter", id: enc.id },
      { type: "combat", id: combat.id },
    ]) {
      await expect(
        applyBoardCommand(
          "addNode",
          { boardId, expectedVersion: view!.version, link, x: 0, y: 0 },
          db,
        ),
      ).rejects.toBeInstanceOf(BoardRuleError);
    }
  });

  it("marks a card missing when its encounter is soft-deleted", async () => {
    const enc = await db.encounter.create({
      data: { campaignId, title: "Gone soon" },
    });
    const view = await getBoard(boardId, db);
    await applyBoardCommand(
      "addNode",
      {
        boardId,
        expectedVersion: view!.version,
        link: { type: "encounter", id: enc.id },
        x: 0,
        y: 0,
      },
      db,
    );
    await db.encounter.update({
      where: { id: enc.id },
      data: { deletedAt: new Date() },
    });
    const after = await getBoard(boardId, db);
    const node = after!.nodes.find(
      (n) => n.link?.type === "encounter" && n.link.id === enc.id,
    );
    expect(node!.link!.missing).toBe(true);
  });
});

describe.skipIf(!safe)("quick create from a board (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let boardId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "QC" } })).id;
    boardId = (await createBoard({ campaignId, name: "QC board" }, db)).id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("creates an NPC in the board's campaign that can become a card", async () => {
    const r = await quickCreateForBoard(
      boardId,
      {
        kind: "npc",
        name: " Mira ",
        role: "Innkeeper",
        race: "Halfling",
        characterClass: "Rogue",
        level: 3,
      },
      db,
    );
    expect(r).toMatchObject({ type: "npc", label: "Mira" });
    const npc = await db.npc.findUnique({ where: { id: r.id } });
    expect(npc).toMatchObject({ campaignId, race: "Halfling", level: 3 });
    await applyBoardCommand(
      "addNode",
      {
        boardId,
        expectedVersion: 0,
        link: { type: r.type, id: r.id },
        x: 0,
        y: 0,
      },
      db,
    );
    const view = await getBoard(boardId, db);
    expect(view!.nodes[0].detail).toContain("Innkeeper");
  });

  it("creates a planned encounter", async () => {
    const r = await quickCreateForBoard(
      boardId,
      { kind: "encounter", title: "Bridge", objective: "Cross" },
      db,
    );
    const enc = await db.encounter.findUnique({ where: { id: r.id } });
    expect(enc).toMatchObject({
      campaignId,
      status: "planned",
      objective: "Cross",
    });
  });

  it("validates input and unknown boards", async () => {
    await expect(
      quickCreateForBoard(boardId, { kind: "npc", name: "  " }, db),
    ).rejects.toThrow();
    await expect(
      quickCreateForBoard(boardId, { kind: "npc", name: "X", level: 99 }, db),
    ).rejects.toThrow();
    await expect(
      quickCreateForBoard(boardId, { kind: "encounter", title: "" }, db),
    ).rejects.toThrow();
    await expect(
      quickCreateForBoard("nope", { kind: "npc", name: "X" }, db),
    ).rejects.toThrow();
    expect(await db.npc.count({ where: { campaignId } })).toBe(1);
  });
});

describe.skipIf(!safe)(
  "board record quick-create and encounter creatures",
  () => {
    let db: PrismaClient;
    let campaignId: string;
    let otherId: string;
    let boardId: string;
    let otherBoardId: string;

    beforeAll(async () => {
      db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      campaignId = (await db.campaign.create({ data: { name: "EE" } })).id;
      otherId = (await db.campaign.create({ data: { name: "EE other" } })).id;
      boardId = (await createBoard({ campaignId, name: "EE board" }, db)).id;
      otherBoardId = (await createBoard({ campaignId: otherId, name: "O" }, db))
        .id;
    });
    afterAll(async () => {
      if (db) await db.$disconnect();
    });

    async function encounterCard(c = campaignId, b = boardId) {
      const enc = await db.encounter.create({
        data: { campaignId: c, title: "Fight" },
      });
      const view = await getBoard(b, db);
      const r = await applyBoardCommand(
        "addNode",
        {
          boardId: b,
          expectedVersion: view!.version,
          link: { type: "encounter", id: enc.id },
          x: 0,
          y: 0,
        },
        db,
      );
      return { enc, nodeId: r.id! };
    }

    it("edits a clue's text in place, only on its own board", async () => {
      const clue = await quickCreateForBoard(
        boardId,
        { kind: "record", recordKind: "clue", name: "Torn page" },
        db,
      );
      const loc = await quickCreateForBoard(
        boardId,
        { kind: "record", recordKind: "location", name: "Mill" },
        db,
      );
      const add = async (rid: string, type: string) => {
        const v = await getBoard(boardId, db);
        return (
          await applyBoardCommand(
            "addNode",
            {
              boardId,
              expectedVersion: v!.version,
              link: { type, id: rid },
              x: 0,
              y: 0,
            },
            db,
          )
        ).id!;
      };
      const clueNode = await add(clue.id, clue.type);
      const locNode = await add(loc.id, loc.type);
      expect(
        await updateClueTextForBoard(
          boardId,
          clueNode,
          "Mentions the mill",
          db,
        ),
      ).toBe("Mentions the mill");
      const view = await getBoard(boardId, db);
      expect(view!.nodes.find((n) => n.id === clueNode)).toMatchObject({
        recordText: "Mentions the mill",
        detail: "Mentions the mill",
      });
      expect(await updateClueTextForBoard(boardId, clueNode, "  ", db)).toBe(
        null,
      );
      await expect(
        updateClueTextForBoard(boardId, locNode, "x", db),
      ).rejects.toThrow();
      await expect(
        updateClueTextForBoard(otherBoardId, clueNode, "x", db),
      ).rejects.toThrow();
    });

    it("edits NPC and faction card notes, nothing else", async () => {
      const npc = await quickCreateForBoard(
        boardId,
        { kind: "npc", name: "Vex" },
        db,
      );
      const fac = await quickCreateForBoard(
        boardId,
        { kind: "record", recordKind: "faction", name: "Guild" },
        db,
      );
      const loc = await quickCreateForBoard(
        boardId,
        { kind: "record", recordKind: "location", name: "Dock" },
        db,
      );
      const add = async (rid: string, type: string) => {
        const v = await getBoard(boardId, db);
        return (
          await applyBoardCommand(
            "addNode",
            {
              boardId,
              expectedVersion: v!.version,
              link: { type, id: rid },
              x: 0,
              y: 0,
            },
            db,
          )
        ).id!;
      };
      const n = await add(npc.id, npc.type);
      const f = await add(fac.id, fac.type);
      const l = await add(loc.id, loc.type);
      await db.npc.update({
        where: { id: npc.id },
        data: { quickSummary: "Smuggler" },
      });
      expect(await updateCardNotesForBoard(boardId, n, "Owes a debt", db)).toBe(
        "Owes a debt",
      );
      await db.storyRecord.update({
        where: { id: fac.id },
        data: { summary: "Merchant guild" },
      });
      expect(await updateCardNotesForBoard(boardId, f, "Rivals", db)).toBe(
        "Rivals",
      );
      expect(
        (await db.storyRecord.findUnique({ where: { id: fac.id } }))?.summary,
      ).toBe("Merchant guild");
      const view = await getBoard(boardId, db);
      expect(view!.nodes.find((x) => x.id === n)).toMatchObject({
        detail: "Smuggler",
        cardNotes: "Owes a debt",
        notesKind: "npc",
      });
      expect(view!.nodes.find((x) => x.id === f)).toMatchObject({
        cardNotes: "Rivals",
        notesKind: "faction",
      });
      await expect(
        updateCardNotesForBoard(boardId, l, "x", db),
      ).rejects.toThrow();
      await expect(
        updateCardNotesForBoard(otherBoardId, n, "x", db),
      ).rejects.toThrow();
    });

    it("creates a story record that becomes a typed card", async () => {
      const r = await quickCreateForBoard(
        boardId,
        { kind: "record", recordKind: "location", name: "Dunmere" },
        db,
      );
      expect(r).toMatchObject({ type: "record:location", label: "Dunmere" });
      const rec = await db.storyRecord.findUnique({ where: { id: r.id } });
      expect(rec).toMatchObject({ campaignId, kind: "location" });
      await expect(
        quickCreateForBoard(
          boardId,
          { kind: "record", recordKind: "dragon", name: "x" },
          db,
        ),
      ).rejects.toThrow();
    });

    it("adds, lists and removes NPC and player creatures", async () => {
      const { nodeId, enc } = await encounterCard();
      const npc = await db.npc.create({ data: { campaignId, name: "Guard" } });
      const pc = await db.playerCharacter.create({
        data: { campaignId, name: "Aria", maxHp: 20, armorClass: 15 },
      });
      await addCreatureForBoard(
        boardId,
        nodeId,
        { kind: "npc", npcId: npc.id, maxHp: 11, armorClass: 12 },
        db,
      );
      await addCreatureForBoard(
        boardId,
        nodeId,
        { kind: "player_character", playerCharacterId: pc.id },
        db,
      );
      const view = await getBoardEncounter(boardId, nodeId, db);
      expect(view.creatures.map((c) => c.label)).toEqual(["Guard", "Aria"]);
      expect(view.npcs.map((n) => n.id)).toContain(npc.id);
      await expect(
        addCreatureForBoard(
          boardId,
          nodeId,
          { kind: "player_character", playerCharacterId: pc.id },
          db,
        ),
      ).rejects.toThrow(/already/);
      await removeCreatureForBoard(boardId, nodeId, view.creatures[0].id, db);
      expect(
        (await getBoardEncounter(boardId, nodeId, db)).creatures,
      ).toHaveLength(1);
      expect(
        await db.encounterEntry.count({ where: { encounterId: enc.id } }),
      ).toBe(1);
    });

    it("refuses cross-board, cross-campaign and non-encounter targets", async () => {
      const { nodeId } = await encounterCard();
      const foreignNpc = await db.npc.create({
        data: { campaignId: otherId, name: "Foreign" },
      });
      await expect(
        addCreatureForBoard(
          boardId,
          nodeId,
          { kind: "npc", npcId: foreignNpc.id, maxHp: 5, armorClass: 10 },
          db,
        ),
      ).rejects.toThrow();
      await expect(
        getBoardEncounter(otherBoardId, nodeId, db),
      ).rejects.toThrow();
      const note = await applyBoardCommand(
        "addNode",
        {
          boardId,
          expectedVersion: (await getBoard(boardId, db))!.version,
          title: "n",
          x: 0,
          y: 0,
        },
        db,
      );
      await expect(getBoardEncounter(boardId, note.id!, db)).rejects.toThrow();
      const { enc, nodeId: n2 } = await encounterCard();
      const entry = await db.encounterEntry.findFirst();
      void enc;
      if (entry)
        await expect(
          removeCreatureForBoard(boardId, n2, entry.id, db),
        ).rejects.toThrow();
    });

    it("adds a library monster with a quantity", async () => {
      const source = await db.ruleSource.upsert({
        where: {
          provider_apiEdition: { provider: "dnd5eapi.co", apiEdition: "2024" },
        },
        update: {},
        create: {
          provider: "dnd5eapi.co",
          apiEdition: "2024",
          apiBaseUrl: "https://example.invalid",
          srdLabel: "test",
          licenseName: "test",
          licenseUrl: "https://example.invalid",
          attribution: "test",
        },
      });
      const monster = await db.ruleEntry.create({
        data: {
          origin: "imported",
          sourceId: source.id,
          contentHash: "test",
          category: "monsters",
          sourceKey: `board-test-goblin-${Date.now()}`,
          name: "Board Test Goblin",
          rawData: {
            hit_points: 7,
            hit_points_roll: "2d6",
            armor_class: [{ type: "natural", value: 15 }],
            dexterity: 14,
          },
        },
        select: { id: true, name: true },
      });
      const { nodeId } = await encounterCard();
      await addCreatureForBoard(
        boardId,
        nodeId,
        { kind: "monster", ruleEntryId: monster.id, quantity: 3 },
        db,
      );
      const view = await getBoardEncounter(boardId, nodeId, db);
      expect(view.creatures[0]).toMatchObject({
        label: monster.name,
        quantity: 3,
      });
    });
  },
);
