import type {
  BoardEdgeView,
  BoardNodeView,
} from "@/server/services/story/boards";

/** Payload shapes accepted by the addItems command. */
export type NodeSpec = {
  id: string;
  imageId?: string | null;
  link: { type: string; id: string } | null;
  kind?: string;
  title: string | null;
  text: string | null;
  dmNote: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  style?: BoardNodeView["style"] & object;
  status: string;
  arcId: string | null;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  parentId: string | null;
};

export type EdgeSpec = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string | null;
  style?: BoardEdgeView["style"] & object;
};

export function newId(): string {
  return `c${crypto.randomUUID().replaceAll("-", "")}`;
}

/** Null when the card cannot be recreated (for example its record is gone). */
export function nodeToSpec(n: BoardNodeView): NodeSpec | null {
  let link: NodeSpec["link"] = null;
  if (n.link) {
    if (n.link.missing) return null;
    if (n.link.type === "record") {
      if (!n.link.recordKind) return null;
      link = { type: `record:${n.link.recordKind}`, id: n.link.id };
    } else link = { type: n.link.type, id: n.link.id };
  } else if (n.kind === "record") return null;
  return {
    id: n.id,
    imageId: n.imageId ?? undefined,
    link,
    kind: link ? undefined : n.kind,
    title: n.title,
    text: n.text,
    dmNote: n.dmNote,
    x: n.x,
    y: n.y,
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    style: n.style ?? undefined,
    status: n.status,
    arcId: n.arcId,
    zIndex: n.zIndex,
    locked: n.locked,
    hidden: n.hidden,
    parentId: n.parentId,
  };
}

export function edgeToSpec(e: BoardEdgeView): EdgeSpec {
  return {
    id: e.id,
    sourceId: e.sourceId,
    targetId: e.targetId,
    type: e.type,
    label: e.label,
    style: e.style ?? undefined,
  };
}

/**
 * Collects the cards, and the arrows between them, for a copy. Arrows are only
 * kept when both ends are part of the copy.
 */
export function collectCopy(
  nodes: BoardNodeView[],
  edges: BoardEdgeView[],
  nodeIds: Set<string>,
): { nodes: NodeSpec[]; edges: EdgeSpec[] } {
  const specs = nodes
    .filter((n) => nodeIds.has(n.id))
    .map(nodeToSpec)
    .filter((s): s is NodeSpec => s !== null);
  const kept = new Set(specs.map((s) => s.id));
  return {
    nodes: specs,
    edges: edges
      .filter((e) => kept.has(e.sourceId) && kept.has(e.targetId))
      .map(edgeToSpec),
  };
}

/** Fresh ids and an offset, so a paste never collides with the original. */
export function remapForPaste(
  copy: { nodes: NodeSpec[]; edges: EdgeSpec[] },
  offset: number,
  make: () => string = newId,
): { nodes: NodeSpec[]; edges: EdgeSpec[] } {
  const ids = new Map(copy.nodes.map((n) => [n.id, make()]));
  const copiedFrames = new Set(
    copy.nodes.filter((n) => n.kind === "frame").map((n) => n.id),
  );
  return {
    nodes: copy.nodes.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      x: n.x + offset,
      y: n.y + offset,
      locked: false,
      // A copied frame brings its copied children; otherwise keep the old parent.
      parentId:
        n.parentId && copiedFrames.has(n.parentId)
          ? (ids.get(n.parentId) ?? null)
          : n.parentId,
    })),
    edges: copy.edges.map((e) => ({
      ...e,
      id: make(),
      sourceId: ids.get(e.sourceId)!,
      targetId: ids.get(e.targetId)!,
    })),
  };
}

export type Box = { id: string; x: number; y: number; w: number; h: number };
export type AlignMode =
  "left" | "center" | "right" | "top" | "middle" | "bottom";

/** New top-left corners after aligning boxes; only boxes that move are returned. */
export function alignBoxes(
  boxes: Box[],
  mode: AlignMode,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 2) return out;
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  for (const b of boxes) {
    let { x, y } = b;
    if (mode === "left") x = left;
    else if (mode === "right") x = right - b.w;
    else if (mode === "center") x = (left + right) / 2 - b.w / 2;
    else if (mode === "top") y = top;
    else if (mode === "bottom") y = bottom - b.h;
    else y = (top + bottom) / 2 - b.h / 2;
    if (x !== b.x || y !== b.y) out.set(b.id, { x, y });
  }
  return out;
}

/** Spreads boxes so the gaps between neighbours are equal. */
export function distributeBoxes(
  boxes: Box[],
  axis: "horizontal" | "vertical",
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 3) return out;
  const h = axis === "horizontal";
  const sorted = [...boxes].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
  const size = (b: Box) => (h ? b.w : b.h);
  const pos = (b: Box) => (h ? b.x : b.y);
  const start = pos(sorted[0]);
  const end = pos(sorted[sorted.length - 1]) + size(sorted[sorted.length - 1]);
  const gap =
    (end - start - sorted.reduce((sum, b) => sum + size(b), 0)) /
    (sorted.length - 1);
  let cursor = start;
  for (const b of sorted) {
    const next = Math.round(cursor * 100) / 100;
    if (next !== pos(b))
      out.set(b.id, h ? { x: next, y: b.y } : { x: b.x, y: next });
    cursor += size(b) + gap;
  }
  return out;
}

/** Target layer for each card for a front/back/forward/backward request. */
export function reorderLayers(
  selected: { id: string; zIndex: number; frame: boolean }[],
  others: number[],
  action: "front" | "back" | "forward" | "backward",
): Map<string, number> {
  const out = new Map<string, number>();
  const max = others.length ? Math.max(...others) : 0;
  const min = others.length ? Math.min(...others) : 0;
  selected.forEach((n, i) => {
    // Frames stay below ordinary cards unless the user moves them explicitly.
    const floor = n.frame ? -1000 : -9;
    let z = n.zIndex;
    if (action === "front") z = Math.max(max, n.zIndex) + 1 + i;
    else if (action === "back") z = Math.min(min, n.zIndex) - 1 - i;
    else if (action === "forward") z = n.zIndex + 1;
    else z = n.zIndex - 1;
    z = Math.min(1000, Math.max(floor, z));
    if (z !== n.zIndex) out.set(n.id, z);
  });
  return out;
}
