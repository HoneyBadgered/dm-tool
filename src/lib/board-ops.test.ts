import { describe, expect, it } from "vitest";
import type { BoardNodeView } from "@/server/services/story/boards";
import {
  alignBoxes,
  collectCopy,
  distributeBoxes,
  nodeToSpec,
  remapForPaste,
  reorderLayers,
} from "./board-ops";

const node = (over: Partial<BoardNodeView>): BoardNodeView => ({
  id: "n",
  kind: "sticky",
  width: 100,
  height: 50,
  zIndex: 0,
  locked: false,
  hidden: false,
  parentId: null,
  style: null,
  x: 0,
  y: 0,
  status: "confirmed",
  title: null,
  text: "hi",
  dmNote: null,
  arcId: null,
  link: null,
  detail: null,
  ...over,
});

describe("alignBoxes", () => {
  const boxes = [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 50, y: 100, w: 40, h: 20 },
  ];
  it("aligns edges and centers, returning only boxes that move", () => {
    expect(alignBoxes(boxes, "left").get("b")).toEqual({ x: 0, y: 100 });
    expect(alignBoxes(boxes, "left").has("a")).toBe(false);
    expect(alignBoxes(boxes, "right").get("b")).toEqual({ x: 60, y: 100 });
    expect(alignBoxes(boxes, "center").get("b")).toEqual({ x: 30, y: 100 });
    expect(alignBoxes(boxes, "bottom").get("a")).toEqual({ x: 0, y: 70 });
    expect(alignBoxes(boxes.slice(0, 1), "left").size).toBe(0);
  });
  it("distributes evenly", () => {
    const three = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 15, y: 0, w: 10, h: 10 },
      { id: "c", x: 100, y: 0, w: 10, h: 10 },
    ];
    expect(distributeBoxes(three, "horizontal").get("b")).toEqual({
      x: 50,
      y: 0,
    });
    expect(distributeBoxes(three.slice(0, 2), "horizontal").size).toBe(0);
  });
});

describe("reorderLayers", () => {
  it("brings to front above others and keeps cards above frames", () => {
    const out = reorderLayers(
      [{ id: "a", zIndex: 0, frame: false }],
      [0, 3],
      "front",
    );
    expect(out.get("a")).toBe(4);
    const back = reorderLayers(
      [{ id: "a", zIndex: 0, frame: false }],
      [-9, 2],
      "back",
    );
    expect(back.get("a")).toBe(-9);
  });
});

describe("copy and paste", () => {
  const frame = node({ id: "f", kind: "frame", zIndex: -10 });
  const a = node({ id: "a", parentId: "f", locked: true });
  const b = node({ id: "b", x: 200 });
  const edges = [
    {
      id: "e1",
      sourceId: "a",
      targetId: "b",
      type: "ally" as const,
      label: null,
      style: null,
    },
    {
      id: "e2",
      sourceId: "a",
      targetId: "outside",
      type: "ally" as const,
      label: null,
      style: null,
    },
  ];

  it("copies only arrows whose ends are both copied", () => {
    const c = collectCopy([frame, a, b], edges, new Set(["a", "b"]));
    expect(c.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(c.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("assigns new ids, offsets, unlocks, and remaps frame parents and arrows", () => {
    let i = 0;
    const make = () => `new${i++}`;
    const c = collectCopy([frame, a, b], edges, new Set(["f", "a", "b"]));
    const p = remapForPaste(c, 30, make);
    const ids = p.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain("a");
    const pa = p.nodes.find((n) => n.x === 30 && n.parentId)!;
    expect(ids).toContain(pa.parentId);
    expect(pa.locked).toBe(false);
    expect(ids).toContain(p.edges[0].sourceId);
    expect(p.edges[0].id).not.toBe("e1");
  });

  it("cannot recreate cards whose record is missing", () => {
    const gone = node({
      id: "r",
      kind: "record",
      link: { type: "npc", id: "x", missing: true, label: "Missing", href: "" },
    });
    expect(nodeToSpec(gone)).toBeNull();
  });
});
