"use client";

import {
  Background,
  applyNodeChanges,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type InternalNode,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EDGE_LABELS,
  EDGE_TYPES,
  FREE_KINDS,
  NODE_STATUSES,
  RECORD_KINDS,
  RECORD_KIND_LABELS,
  type BoardStyle,
  type FreeKind,
  type EdgeType,
  type NodeStatus,
} from "@/lib/validation/board";
import type {
  BoardEdgeView,
  BoardNodeView,
  BoardView,
} from "@/server/services/story/boards";
import type {
  LinkableItem,
  NodeDetail,
} from "@/server/services/story/board-detail";
import {
  FREE_DEFAULTS,
  ResizeContext,
  StyleEditor,
  freeNodeTypes,
  type FreeData,
  type FreePatch,
} from "./free-nodes";
import {
  alignBoxes,
  collectCopy,
  distributeBoxes,
  edgeToSpec,
  nodeToSpec,
  remapForPaste,
  reorderLayers,
  type AlignMode,
  type EdgeSpec,
  type NodeSpec,
} from "@/lib/board-ops";
import {
  fetchBoardView,
  fetchLinkable,
  quickCreateRecord,
  saveClueText as saveClue,
  saveCardNotes as saveNotesAction,
  fetchBoardEncounter,
  searchMonsters,
  addEncounterCreature,
  removeEncounterCreature,
  fetchNodeDetail,
  runBoardCommand,
  type CommandResult,
} from "./board-actions";

type CardData = {
  title: string;
  sub: string;
  detail: string | null;
  status: NodeStatus;
  color: string | null;
  missing: boolean;
  hasNote: boolean;
  dmNote: string | null;
  text: string | null;
  arcId: string | null;
  isNote: boolean;
  recordText: string | null;
  cardNotes: string | null;
  notesKind: string | null;
  kind: string;
  imageId: string | null;
  imageUrl: string | null;
  style: BoardStyle | null;
  locked: boolean;
  hidden: boolean;
  [key: string]: unknown;
};

const EDGE_COLORS: Record<EdgeType, string> = {
  ally: "#2f7d4f",
  enemy: "#b3261e",
  serves: "#3b6ea5",
  knows_secret: "#7a4fa3",
  reveals_clue: "#b07b12",
  causes_event: "#555555",
  plain: "#555555",
};

const STATUS_LABELS: Record<NodeStatus, string> = {
  confirmed: "Confirmed fact",
  possible: "Possible / future",
  retired: "Retired",
};

const ShowNotes = createContext(false);
const NoteTextEditor = createContext<(nodeId: string, text: string) => void>(
  () => {},
);

const ClueTextEditor = createContext<(nodeId: string, text: string) => void>(
  () => {},
);

const CardNotesEditor = createContext<(nodeId: string, text: string) => void>(
  () => {},
);

function CardNode({ id, data, selected }: NodeProps<Node<CardData>>) {
  const showNotes = useContext(ShowNotes);
  const saveNoteText = useContext(NoteTextEditor);
  const saveClueText = useContext(ClueTextEditor);
  const saveCardNotes = useContext(CardNotesEditor);
  const isClue = data.sub === "clue" && !data.missing;
  const border = data.color ?? "var(--muted)";
  const type = TYPE_STYLES[data.sub] ?? TYPE_STYLES.note;
  return (
    <div
      className={`w-56 overflow-hidden rounded-lg bg-surface text-sm shadow-md ${
        data.status === "retired" ? "opacity-50" : ""
      } ${selected ? "ring-2 ring-highlight" : ""}`}
      style={{
        border: `2px ${data.status === "possible" ? "dashed" : "solid"} ${border}`,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className="flex items-center justify-between px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-primary"
        style={{ background: type.badge }}
      >
        <span>{data.isNote ? data.title || type.label : type.label}</span>
        {data.hasNote ? (
          <span title="Has private DM note" aria-label="Has private DM note">
            🔒
          </span>
        ) : null}
      </div>
      <div className="px-2 py-1.5">
        {!data.isNote && (
          <div
            className={`font-semibold ${data.missing ? "italic text-danger" : ""}`}
          >
            {data.title}
          </div>
        )}
        {data.isNote ? (
          <NoteTextInput
            key={`${id}:${data.text ?? ""}`}
            id={id}
            title={data.title}
            text={data.text ?? ""}
            disabled={data.locked}
            onSave={saveNoteText}
          />
        ) : isClue ? (
          <NoteTextInput
            key={`${id}:${data.recordText ?? ""}`}
            id={id}
            title={data.title}
            text={data.recordText ?? ""}
            disabled={data.locked}
            onSave={saveClueText}
            label="Clue text"
            placeholder="Click to write the clue…"
          />
        ) : data.detail ? (
          <div className="mt-0.5 line-clamp-3 text-xs text-muted">
            {data.detail}
          </div>
        ) : null}
        {data.notesKind && !data.missing ? (
          <details
            className="nodrag mt-1.5 rounded border border-border"
            open={!!data.cardNotes}
          >
            <summary className="cursor-pointer select-none px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {data.cardNotes ? "Notes" : "Add notes"}
            </summary>
            <div className="px-1 pb-1">
              <NoteTextInput
                key={`${id}:notes:${data.cardNotes ?? ""}`}
                id={id}
                title={data.title}
                text={data.cardNotes ?? ""}
                disabled={data.locked}
                onSave={saveCardNotes}
                label="Notes"
                placeholder="Write more notes…"
              />
            </div>
          </details>
        ) : null}
        {showNotes && data.dmNote ? (
          <div className="mt-1 line-clamp-6 whitespace-pre-wrap rounded border border-magic bg-magic/15 px-1.5 py-1 text-xs text-magic">
            <span className="font-semibold">DM: </span>
            {data.dmNote}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function NoteTextInput({
  id,
  title,
  text,
  disabled,
  onSave,
  label = "Note text",
  placeholder = "Click to add note text…",
}: {
  id: string;
  title: string;
  text: string;
  disabled: boolean;
  onSave: (nodeId: string, text: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(text);
  return (
    <textarea
      aria-label={`${label} for ${title || "board card"}`}
      value={value}
      disabled={disabled}
      maxLength={5000}
      rows={Math.max(3, Math.min(8, value.split("\n").length + 2))}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== text) onSave(id, value.trim() ? value : "");
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="nodrag nowheel mt-1 block w-full resize-y rounded border border-border bg-input/70 px-1.5 py-1 text-xs leading-5 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-highlight disabled:resize-none disabled:border-transparent disabled:bg-transparent"
    />
  );
}

const nodeTypes = { card: CardNode, ...freeNodeTypes };

const isFree = (kind: unknown): kind is FreeKind =>
  FREE_KINDS.includes(kind as FreeKind);

const TYPE_STYLES: Record<string, { label: string; badge: string }> = {
  npc: { label: "NPC", badge: "#7c3aed" },
  player_character: { label: "Player character", badge: "#2563eb" },
  session: { label: "Session", badge: "#0f766e" },
  encounter: { label: "Encounter", badge: "#b91c1c" },
  combat: { label: "Combat", badge: "#475569" },
  faction: { label: "Faction", badge: "#b45309" },
  location: { label: "Location", badge: "#15803d" },
  quest: { label: "Quest", badge: "#c2410c" },
  clue: { label: "Clue", badge: "#a16207" },
  event: { label: "Event", badge: "#be123c" },
  note: { label: "Note", badge: "#4b5563" },
};

function typeKey(n: BoardNodeView): string {
  if (!n.link) return "note";
  if (n.link.type === "record") return n.link.recordKind ?? "note";
  return n.link.type;
}

function toFlowNode(
  n: BoardNodeView,
  arcColors: Map<string, string>,
  parentAbs?: { x: number; y: number },
): Node {
  const data: CardData = {
    title: n.link ? n.link.label : (n.title ?? (isFree(n.kind) ? "" : "Note")),
    detail: n.detail,
    sub: typeKey(n),
    status: n.status,
    color: n.arcId ? (arcColors.get(n.arcId) ?? null) : null,
    missing: n.link?.missing ?? false,
    hasNote: !!n.dmNote,
    dmNote: n.dmNote,
    text: n.text,
    arcId: n.arcId,
    isNote: n.kind === "note",
    recordText: n.recordText ?? null,
    cardNotes: n.cardNotes ?? null,
    notesKind: n.notesKind ?? null,
    kind: n.kind,
    imageId: n.imageId ?? null,
    imageUrl: n.imageUrl ?? null,
    style: n.style,
    locked: n.locked,
    hidden: n.hidden,
  };
  const free = isFree(n.kind);
  return {
    id: n.id,
    type: free ? n.kind : "card",
    position: parentAbs
      ? { x: n.x - parentAbs.x, y: n.y - parentAbs.y }
      : { x: n.x, y: n.y },
    ...(parentAbs && n.parentId ? { parentId: n.parentId } : {}),
    ...(free && n.width ? { width: n.width } : {}),
    ...(free && n.height ? { height: n.height } : {}),
    zIndex: n.zIndex,
    draggable: !n.locked,
    data,
  };
}

/** Frames come first because React Flow needs parents before children. */
function buildNodes(
  views: BoardNodeView[],
  arcColors: Map<string, string>,
): Node[] {
  const byId = new Map(views.map((v) => [v.id, v]));
  const ordered = [
    ...views.filter((v) => v.kind === "frame"),
    ...views.filter((v) => v.kind !== "frame"),
  ];
  return ordered.map((v) => {
    const parent = v.parentId ? byId.get(v.parentId) : undefined;
    return toFlowNode(
      v,
      arcColors,
      parent && parent.kind === "frame"
        ? { x: parent.x, y: parent.y }
        : undefined,
    );
  });
}

const framesFirst = (ns: Node[]) => [
  ...ns.filter((n) => n.type === "frame"),
  ...ns.filter((n) => n.type !== "frame"),
];

type EdgeData = {
  type: EdgeType;
  label: string | null;
  style: BoardStyle | null;
};

function toFlowEdge(e: BoardEdgeView): Edge {
  const color = EDGE_COLORS[e.type];
  const width = e.style?.borderWidth ?? 2;
  return {
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    label:
      e.type === "plain"
        ? (e.label ?? undefined)
        : e.label
          ? `${EDGE_LABELS[e.type]}: ${e.label}`
          : EDGE_LABELS[e.type],
    data: { type: e.type, label: e.label, style: e.style } satisfies EdgeData,
    style: {
      stroke: color,
      strokeWidth: width,
      strokeDasharray: e.style?.dashed ? "8 5" : undefined,
    },
    labelStyle: { fill: color, fontSize: 11 },
    markerEnd: { type: MarkerType.ArrowClosed, color },
  };
}

type SaveState = "saved" | "saving" | "error";

type OpName =
  "addItems" | "removeItems" | "updateNodes" | "moveNodes" | "updateEdge";
type Op = { name: OpName; input: Record<string, unknown> };
type Entry = { undo: Op[]; redo: Op[] };
type HistoryEntry = Entry & { key?: string; at: number };
type Pos = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string | null;
};

const MAX_HISTORY = 100;
const nowMs = () => Date.now();

// Survives switching boards within the tab, so cards can be pasted across boards.
const clipboardStore: {
  current: { campaignId: string; nodes: NodeSpec[]; edges: EdgeSpec[] } | null;
} = { current: null };

const opIds = (ops: Op[]): string[] =>
  ops.flatMap((op) => {
    const i = op.input as {
      nodes?: { id: string }[];
      patches?: { nodeId: string }[];
      positions?: { id: string }[];
    };
    return [
      ...(i.nodes ?? []).map((n) => n.id),
      ...(i.patches ?? []).map((p) => p.nodeId),
      ...(i.positions ?? []).map((p) => p.id),
    ];
  });

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
};

function Canvas({ board }: { board: BoardView }) {
  const { screenToFlowPosition, setViewport, getInternalNode, fitView } =
    useReactFlow();
  const arcColors = useMemo(
    () => new Map(board.arcs.map((a) => [a.id, a.color])),
    [board.arcs],
  );
  const [arcs, setArcs] = useState(board.arcs);
  const colorMap = useMemo(
    () => new Map(arcs.map((a) => [a.id, a.color])),
    [arcs],
  );
  const [nodes, setNodes] = useState<Node[]>(() =>
    buildNodes(board.nodes, arcColors),
  );
  const [edges, setEdges] = useState<Edge[]>(() => board.edges.map(toFlowEdge));
  const [save, setSave] = useState<SaveState>("saved");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<Connection | null>(null);
  const [selection, setSelection] = useState<{
    nodes: string[];
    edges: string[];
  }>({ nodes: [], edges: [] });
  const [detail, setDetail] = useState<{
    nodeId: string;
    data: NodeDetail | null;
    loading: boolean;
  } | null>(null);
  const [linkable, setLinkable] = useState<LinkableItem[] | null>(null);
  const version = useRef(board.version);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const viewportRef = useRef(board.viewport);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const dead = useRef(false);

  useEffect(() => {
    if (board.viewport) setViewport(board.viewport);
  }, [board.viewport, setViewport]);

  // Commands run one at a time so each carries the version the server expects.
  const exec = useCallback(
    async (
      name: Parameters<typeof runBoardCommand>[0],
      input: object,
    ): Promise<CommandResult> => {
      if (dead.current)
        return { ok: false, error: "Board is out of date", conflict: true };
      setSave("saving");
      const result = await runBoardCommand(name, {
        ...input,
        boardId: board.id,
        expectedVersion: version.current,
      }).catch((): CommandResult => ({
        ok: false,
        error: "Network error. Try again.",
      }));
      if (result.ok) {
        version.current = result.version;
        setSave((s) => (s === "error" ? s : "saved"));
        setError(null);
      } else {
        setSave("error");
        setError(result.error);
        if (result.conflict) {
          dead.current = true;
          setConflict(true);
        }
      }
      return result;
    },
    [board.id],
  );

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const job = chain.current.then(fn);
    chain.current = job.catch(() => undefined);
    return job;
  }, []);

  const send = useCallback(
    (name: Parameters<typeof runBoardCommand>[0], input: object) =>
      enqueue(() => exec(name, input)),
    [enqueue, exec],
  );

  const history = useRef<{ undo: HistoryEntry[]; redo: HistoryEntry[] }>({
    undo: [],
    redo: [],
  });
  const [histCount, setHistCount] = useState({ undo: 0, redo: 0 });
  const syncHist = () =>
    setHistCount({
      undo: history.current.undo.length,
      redo: history.current.redo.length,
    });

  /** Records an already-applied change. Rapid edits with one key merge into one step. */
  const record = (entry: Entry & { key?: string }) => {
    const h = history.current;
    const last = h.undo[h.undo.length - 1];
    const now = nowMs();
    if (entry.key && last?.key === entry.key && now - last.at < 2500) {
      last.redo = entry.redo;
      last.at = now;
    } else {
      h.undo.push({ ...entry, at: now });
      if (h.undo.length > MAX_HISTORY) h.undo.shift();
    }
    h.redo = [];
    syncHist();
  };

  const applyView = useCallback((view: BoardView, select: string[]) => {
    version.current = view.version;
    const colors = new Map(view.arcs.map((a) => [a.id, a.color]));
    const sel = new Set(select);
    setArcs(view.arcs);
    setNodes(
      buildNodes(view.nodes, colors).map((n) => ({
        ...n,
        selected: sel.has(n.id),
      })),
    );
    setEdges(view.edges.map(toFlowEdge));
    setSelection({
      nodes: select.filter((id) => view.nodes.some((n) => n.id === id)),
      edges: [],
    });
    setDetail((d) =>
      d && view.nodes.some((n) => n.id === d.nodeId) ? d : null,
    );
  }, []);

  /** Runs commands in order, then reloads the board so the screen shows saved state. */
  const runOps = useCallback(
    (ops: Op[], select: string[]) =>
      enqueue(async () => {
        let ok = true;
        for (const op of ops) {
          const r = await exec(op.name, op.input);
          if (!r.ok) {
            ok = false;
            break;
          }
        }
        if (!dead.current) {
          const view = await fetchBoardView(board.id);
          if (view) applyView(view, select);
        }
        return ok;
      }),
    [applyView, board.id, enqueue, exec],
  );

  const act = async (entry: Entry, select: string[]) => {
    if (conflict) return false;
    const ok = await runOps(entry.redo, select);
    if (ok) record(entry);
    return ok;
  };

  const undo = async () => {
    const e = history.current.undo.pop();
    if (!e || conflict) return;
    syncHist();
    const ok = await runOps(e.undo, opIds(e.undo));
    if (ok) history.current.redo.push(e);
    syncHist();
  };

  const redo = async () => {
    const e = history.current.redo.pop();
    if (!e || conflict) return;
    syncHist();
    const ok = await runOps(e.redo, opIds(e.redo));
    if (ok) history.current.undo.push(e);
    syncHist();
  };

  const savePositions = useCallback(
    (
      positions: {
        id: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
        parentId?: string | null;
      }[],
    ) => {
      if (positions.length === 0) return;
      return send("moveNodes", {
        positions,
        viewport: viewportRef.current ?? undefined,
      });
    },
    [send],
  );

  const absOf = useCallback(
    (id: string) => getInternalNode(id)?.internals.positionAbsolute ?? null,
    [getInternalNode],
  );

  const sizeOf = (n: InternalNode | undefined) => ({
    w: n?.width ?? n?.measured?.width ?? 0,
    h: n?.height ?? n?.measured?.height ?? 0,
  });

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((ns) =>
        applyNodeChanges(
          changes.filter((c) => c.type !== "remove"),
          ns,
        ),
      ),
    [],
  );

  const dragStart = useRef(new Map<string, Pos>());
  const resizeStart = useRef(new Map<string, Pos>());

  const onNodeDragStart = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      const prev = new Map<string, Pos>();
      const add = (n: Node) => {
        const abs = absOf(n.id);
        if (abs)
          prev.set(n.id, {
            id: n.id,
            x: abs.x,
            y: abs.y,
            ...(n.type !== "frame" ? { parentId: n.parentId ?? null } : {}),
          });
      };
      for (const n of dragged) {
        add(n);
        if (n.type === "frame")
          nodesRef.current.filter((c) => c.parentId === n.id).forEach(add);
      }
      dragStart.current = prev;
    },
    [absOf],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      const positions: Parameters<typeof savePositions>[0] = [];
      const reparent = new Map<string, string | null>();
      const frames = nodesRef.current.filter((n) => n.type === "frame");
      for (const n of dragged) {
        const abs = absOf(n.id);
        if (!abs) continue;
        const entry: (typeof positions)[number] = {
          id: n.id,
          x: abs.x,
          y: abs.y,
        };
        if (n.type === "frame") {
          // Children moved with the frame, so save their new absolute spots too.
          for (const c of nodesRef.current.filter((x) => x.parentId === n.id)) {
            const ca = absOf(c.id);
            if (ca) positions.push({ id: c.id, x: ca.x, y: ca.y });
          }
        } else {
          const { w, h } = sizeOf(getInternalNode(n.id));
          const cx = abs.x + w / 2;
          const cy = abs.y + h / 2;
          const host = [...frames].reverse().find((f) => {
            if (f.id === n.id) return false;
            const fa = absOf(f.id);
            const { w: fw, h: fh } = sizeOf(getInternalNode(f.id));
            return (
              !!fa &&
              cx >= fa.x &&
              cx <= fa.x + fw &&
              cy >= fa.y &&
              cy <= fa.y + fh
            );
          });
          const next = host?.id ?? null;
          if ((n.parentId ?? null) !== next) {
            entry.parentId = next;
            reparent.set(n.id, next);
          }
        }
        positions.push(entry);
      }
      if (reparent.size > 0)
        setNodes((ns) =>
          framesFirst(
            ns.map((n) => {
              if (!reparent.has(n.id)) return n;
              const parent = reparent.get(n.id) ?? null;
              const abs = absOf(n.id);
              const pa = parent ? absOf(parent) : null;
              if (!abs) return n;
              const { parentId: _drop, ...rest } = n;
              void _drop;
              return {
                ...rest,
                ...(parent ? { parentId: parent } : {}),
                position: pa ? { x: abs.x - pa.x, y: abs.y - pa.y } : abs,
              };
            }),
          ),
        );
      const before = dragStart.current;
      const after = positions.map((p) => {
        const was = before.get(p.id);
        return was && "parentId" in was && p.parentId === undefined
          ? { ...p, parentId: was.parentId }
          : p;
      });
      const moved = after.filter((p) => {
        const was = before.get(p.id);
        return (
          was &&
          (Math.abs(was.x - p.x) > 0.5 ||
            Math.abs(was.y - p.y) > 0.5 ||
            (p.parentId !== undefined && p.parentId !== was.parentId))
        );
      });
      savePositions(positions);
      if (moved.length > 0) {
        record({
          undo: [
            {
              name: "moveNodes",
              input: { positions: moved.map((p) => before.get(p.id)!) },
            },
          ],
          redo: [{ name: "moveNodes", input: { positions: moved } }],
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [absOf, getInternalNode, savePositions],
  );

  const fullBox = useCallback(
    (
      id: string,
      p: { x: number; y: number; width: number; height: number },
    ) => {
      const node = nodesRef.current.find((n) => n.id === id);
      const pa = node?.parentId ? absOf(node.parentId) : null;
      return {
        id,
        x: p.x + (pa?.x ?? 0),
        y: p.y + (pa?.y ?? 0),
        width: Math.round(p.width),
        height: Math.round(p.height),
      };
    },
    [absOf],
  );

  const resizeHandlers = useMemo(
    () => ({
      start: (
        id: string,
        p: { x: number; y: number; width: number; height: number },
      ) => resizeStart.current.set(id, fullBox(id, p)),
      end: (
        id: string,
        p: { x: number; y: number; width: number; height: number },
      ) => {
        const next = fullBox(id, p);
        savePositions([next]);
        const prev = resizeStart.current.get(id);
        if (prev)
          record({
            undo: [{ name: "moveNodes", input: { positions: [prev] } }],
            redo: [{ name: "moveNodes", input: { positions: [next] } }],
          });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullBox, savePositions],
  );

  const onMoveEnd = useCallback(
    (_: unknown, vp: { x: number; y: number; zoom: number }) => {
      viewportRef.current = vp;
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(() => {
        const first = nodesRef.current[0];
        const abs = first ? absOf(first.id) : null;
        if (first && abs) savePositions([{ id: first.id, x: abs.x, y: abs.y }]);
      }, 1200);
    },
    [absOf, savePositions],
  );

  const confirmEdge = async (type: EdgeType, label: string) => {
    if (!pending?.source || !pending.target) return;
    const { source, target } = pending;
    setPending(null);
    const r = await send("addEdge", {
      sourceId: source,
      targetId: target,
      type,
      label: label || null,
    });
    if (r.ok && r.id) {
      const view: BoardEdgeView = {
        id: r.id,
        sourceId: source,
        targetId: target,
        type,
        label: label || null,
        style: null,
      };
      setEdges((es) => [...es, toFlowEdge(view)]);
      record({
        undo: [
          { name: "removeItems", input: { nodeIds: [], edgeIds: [r.id] } },
        ],
        redo: [
          {
            name: "addItems",
            input: { nodes: [], edges: [edgeToSpec(view)] },
          },
        ],
      });
    }
  };

  const recordAdded = (view: BoardNodeView) => {
    const spec = nodeToSpec(view);
    if (!spec) return;
    record({
      undo: [
        { name: "removeItems", input: { nodeIds: [view.id], edgeIds: [] } },
      ],
      redo: [{ name: "addItems", input: { nodes: [spec], edges: [] } }],
    });
  };

  const addCard = async (
    link: { type: string; id: string } | null,
    title: string,
    text: string,
  ) => {
    const el = document.getElementById("board-canvas");
    const rect = el?.getBoundingClientRect();
    const jitter = (nodes.length % 8) * 48;
    const pos = rect
      ? screenToFlowPosition({
          x: rect.left + rect.width / 2 + jitter,
          y: rect.top + rect.height / 2 + jitter,
        })
      : { x: 0, y: 0 };
    const r = await send("addNode", {
      link,
      title: title || null,
      text: text || null,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
    });
    if (r.ok && r.id) {
      // Reload linked card labels from the server so the title is exact.
      const d = link ? await fetchNodeDetail(board.id, r.id) : null;
      const view: BoardNodeView = {
        id: r.id,
        kind: link ? "record" : "note",
        width: null,
        height: null,
        zIndex: 0,
        locked: false,
        hidden: false,
        parentId: null,
        style: null,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        status: "confirmed",
        title: title || null,
        text: text || null,
        dmNote: null,
        detail: d
          ? d.fields.map((f) => f.value).join(" · ") ||
            (d.body ? d.body.slice(0, 140) : null)
          : text || null,
        recordText: d?.summary ?? null,
        cardNotes: d?.notes ?? null,
        notesKind:
          d && !d.missing
            ? link?.type === "npc"
              ? "npc"
              : link?.type === "record:faction"
                ? "faction"
                : null
            : null,
        arcId: null,
        link: link
          ? ({
              type: link.type.startsWith("record") ? "record" : link.type,
              id: link.id,
              missing: !d || d.missing,
              label: d?.title ?? "Card",
              recordKind: link.type.startsWith("record:")
                ? link.type.slice(7)
                : undefined,
              href: d?.href ?? "",
            } as BoardNodeView["link"])
          : null,
      };
      setNodes((ns) => [...ns, toFlowNode(view, colorMap)]);
      recordAdded(view);
    }
  };

  const addFree = async (kind: FreeKind, shape?: BoardStyle["shape"]) => {
    const def = FREE_DEFAULTS[kind];
    const rect = document
      .getElementById("board-canvas")
      ?.getBoundingClientRect();
    const jitter = (nodes.length % 8) * 32;
    const pos = rect
      ? screenToFlowPosition({
          x: rect.left + rect.width / 2 - def.width / 2 + jitter,
          y: rect.top + rect.height / 2 - def.height / 2 + jitter,
        })
      : { x: 0, y: 0 };
    const style = { ...def.style, ...(shape ? { shape } : {}) };
    const title = kind === "frame" ? "New frame" : null;
    const text =
      kind === "sticky" ? "New note" : kind === "text" ? "Text" : null;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const r = await send("addNode", {
      kind,
      title,
      text,
      x,
      y,
      width: def.width,
      height: def.height,
      style,
    });
    if (r.ok && r.id) {
      const view: BoardNodeView = {
        id: r.id,
        kind,
        width: def.width,
        height: def.height,
        zIndex: kind === "frame" ? -10 : 0,
        locked: false,
        hidden: false,
        parentId: null,
        style,
        x,
        y,
        status: "confirmed",
        title,
        text,
        dmNote: null,
        detail: null,
        arcId: null,
        link: null,
      };
      setNodes((ns) => framesFirst([...ns, toFlowNode(view, colorMap)]));
      recordAdded(view);
    }
  };

  const updateFree = async (nodeId: string, patch: FreePatch) => {
    const before = nodesRef.current.find((n) => n.id === nodeId)?.data as
      CardData | undefined;
    const r = await send("updateNode", { nodeId, ...patch });
    if (!r.ok) return;
    const nextStyle = patch.style
      ? { ...(before?.style ?? {}), ...patch.style }
      : undefined;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as CardData;
        return {
          ...n,
          data: {
            ...d,
            ...(patch.text !== undefined ? { text: patch.text } : {}),
            ...(patch.title !== undefined ? { title: patch.title ?? "" } : {}),
            ...(nextStyle ? { style: nextStyle } : {}),
          },
        };
      }),
    );
    if (!before) return;
    const undoPatch: Record<string, unknown> = { nodeId };
    const redoPatch: Record<string, unknown> = { nodeId };
    if (patch.text !== undefined) {
      undoPatch.text = before.text ?? null;
      redoPatch.text = patch.text;
    }
    if (patch.title !== undefined) {
      undoPatch.title = before.title || null;
      redoPatch.title = patch.title;
    }
    if (nextStyle) {
      undoPatch.replaceStyle = before.style ?? {};
      redoPatch.replaceStyle = nextStyle;
    }
    record({
      key: `edit:${nodeId}`,
      undo: [{ name: "updateNodes", input: { patches: [undoPatch] } }],
      redo: [{ name: "updateNodes", input: { patches: [redoPatch] } }],
    });
  };

  const patchEdge = async (
    edgeId: string,
    patch: { type?: EdgeType; style?: BoardStyle },
  ) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const d = edge.data as EdgeData;
    const r = await send("updateEdge", { edgeId, ...patch });
    if (!r.ok) return;
    setEdges((es) =>
      es.map((e) =>
        e.id === edgeId
          ? toFlowEdge({
              id: e.id,
              sourceId: e.source,
              targetId: e.target,
              type: patch.type ?? d.type,
              label: d.label,
              style: { ...(d.style ?? {}), ...patch.style },
            })
          : e,
      ),
    );
    const undoInput: Record<string, unknown> = { edgeId };
    if (patch.type) undoInput.type = d.type;
    if (patch.style)
      undoInput.style = {
        borderWidth: d.style?.borderWidth ?? 2,
        dashed: d.style?.dashed ?? false,
      };
    record({
      key: `edge:${edgeId}`,
      undo: [{ name: "updateEdge", input: undoInput }],
      redo: [{ name: "updateEdge", input: { edgeId, ...patch } }],
    });
  };
  const updateEdgeStyle = (edgeId: string, style: BoardStyle) =>
    patchEdge(edgeId, { style });
  const changeEdgeType = (edgeId: string, type: EdgeType) =>
    patchEdge(edgeId, { type });

  const updateNode = async (
    nodeId: string,
    patch: {
      status?: NodeStatus;
      dmNote?: string | null;
      arcId?: string | null;
    },
  ) => {
    const r = await send("updateNode", { nodeId, ...patch });
    if (!r.ok) return;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as CardData;
        const arcId = patch.arcId !== undefined ? patch.arcId : d.arcId;
        const dmNote = patch.dmNote !== undefined ? patch.dmNote : d.dmNote;
        return {
          ...n,
          data: {
            ...d,
            ...(patch.status ? { status: patch.status } : {}),
            dmNote,
            hasNote: !!dmNote,
            arcId,
            color: arcId ? (colorMap.get(arcId) ?? null) : null,
          },
        };
      }),
    );
  };

  const onNodeClick = async (_: unknown, node: Node) => {
    if (isFree(node.type)) {
      setDetail({ nodeId: node.id, data: null, loading: false });
      return;
    }
    setDetail({ nodeId: node.id, data: null, loading: true });
    const data = await fetchNodeDetail(board.id, node.id);
    setDetail((d) =>
      d?.nodeId === node.id ? { nodeId: node.id, data, loading: false } : d,
    );
  };

  const refreshDetail = async (nodeId: string) => {
    const data = await fetchNodeDetail(board.id, nodeId);
    setDetail((d) => (d?.nodeId === nodeId ? { ...d, data } : d));
  };

  const onSelectionChange = useCallback(
    ({ nodes: ns, edges: es }: OnSelectionChangeParams) =>
      setSelection({ nodes: ns.map((n) => n.id), edges: es.map((e) => e.id) }),
    [],
  );

  const addArc = async (name: string, color: string) => {
    const r = await send("addArc", { name, color });
    if (r.ok && r.id) setArcs((a) => [...a, { id: r.id!, name, color }]);
  };

  const removeArc = async (arcId: string) => {
    if (!window.confirm("Remove this story arc? Cards keep their place."))
      return;
    const r = await send("removeArc", { arcId });
    if (!r.ok) return;
    setArcs((a) => a.filter((x) => x.id !== arcId));
    setNodes((ns) =>
      ns.map((n) =>
        (n.data as CardData).arcId === arcId
          ? { ...n, data: { ...n.data, arcId: null, color: null } }
          : n,
      ),
    );
  };

  const [showHidden, setShowHidden] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [boxSelect, setBoxSelect] = useState(false);
  const [hasClip, setHasClip] = useState(clipboardStore.current !== null);
  const pasteCount = useRef(0);

  const dataOf = (id: string) =>
    nodesRef.current.find((n) => n.id === id)?.data as CardData | undefined;
  const lockedIds = new Set(
    nodes.filter((n) => (n.data as CardData).locked).map((n) => n.id),
  );
  const movable = selection.nodes.filter((id) => !lockedIds.has(id));
  const hiddenCount = nodes.filter((n) => (n.data as CardData).hidden).length;

  /** Reads saved state in order with pending saves, so copies are never stale. */
  const snapshot = () =>
    enqueue(async () => (dead.current ? null : fetchBoardView(board.id)));

  const deleteSelected = async () => {
    const ids = movable;
    const skipped = selection.nodes.length - ids.length;
    const edgeIds = selection.edges;
    if (ids.length + edgeIds.length === 0) {
      if (skipped)
        setError("Locked items can't be deleted. Unlock them first.");
      return;
    }
    if (
      ids.length + edgeIds.length > 3 &&
      !window.confirm(
        `Delete ${ids.length + edgeIds.length} items? You can undo this. Linked records are not deleted.`,
      )
    )
      return;
    const view = await snapshot();
    if (!view) return;
    const gone = new Set(ids);
    const specs = view.nodes
      .filter((n) => gone.has(n.id))
      .map(nodeToSpec)
      .filter((x): x is NodeSpec => x !== null);
    const restorable = new Set(specs.map((x) => x.id));
    const edgeSpecs = view.edges
      .filter(
        (e) =>
          (gone.has(e.sourceId) ||
            gone.has(e.targetId) ||
            edgeIds.includes(e.id)) &&
          (!gone.has(e.sourceId) || restorable.has(e.sourceId)) &&
          (!gone.has(e.targetId) || restorable.has(e.targetId)),
      )
      .map(edgeToSpec);
    // Cards inside deleted frames are kept; undo puts them back in the frame.
    const orphans = view.nodes
      .filter((n) => n.parentId && gone.has(n.parentId) && !gone.has(n.id))
      .map((n) => ({ id: n.id, x: n.x, y: n.y, parentId: n.parentId }));
    const undoOps: Op[] = [
      { name: "addItems", input: { nodes: specs, edges: edgeSpecs } },
    ];
    if (orphans.length)
      undoOps.push({ name: "moveNodes", input: { positions: orphans } });
    await act(
      {
        redo: [{ name: "removeItems", input: { nodeIds: ids, edgeIds } }],
        undo: undoOps,
      },
      [],
    );
    if (skipped) setError("Locked items were skipped.");
  };

  const copySelection = async () => {
    if (selection.nodes.length === 0) return;
    const view = await snapshot();
    if (!view) return;
    clipboardStore.current = {
      campaignId: view.campaignId,
      ...collectCopy(view.nodes, view.edges, new Set(selection.nodes)),
    };
    pasteCount.current = 0;
    setHasClip(clipboardStore.current.nodes.length > 0);
  };

  const pasteSpecs = async (copy: { nodes: NodeSpec[]; edges: EdgeSpec[] }) => {
    if (copy.nodes.length === 0) return;
    pasteCount.current += 1;
    const made = remapForPaste(copy, 32 * pasteCount.current);
    const ids = made.nodes.map((n) => n.id);
    await act(
      {
        redo: [{ name: "addItems", input: made }],
        undo: [
          {
            name: "removeItems",
            input: { nodeIds: ids, edgeIds: made.edges.map((e) => e.id) },
          },
        ],
      },
      ids,
    );
  };

  const pasteClipboard = async () => {
    const clipboard = clipboardStore.current;
    if (!clipboard) return;
    const view = await snapshot();
    if (!view) return;
    if (view.campaignId !== clipboard.campaignId) {
      setError("Cards can only be pasted into a board in the same campaign.");
      return;
    }
    await pasteSpecs(clipboard);
  };

  const pasteImage = async (file: File) => {
    if (conflict || dead.current) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Images must be 5 MB or smaller.");
      return;
    }

    let width: number;
    let height: number;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
      width = Math.max(20, Math.round(bitmap.width * scale));
      height = Math.max(20, Math.round(bitmap.height * scale));
      bitmap.close();
    } catch {
      setError("Could not read that clipboard image.");
      return;
    }

    await enqueue(async () => {
      if (conflict || dead.current) return;
      const canvas = document.getElementById("board-canvas");
      const rect = canvas?.getBoundingClientRect();
      if (!rect) {
        setError("The board canvas is unavailable.");
        return;
      }
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const offset = (nodesRef.current.length % 8) * 28;
      const x = Math.round(center.x - width / 2 + offset);
      const y = Math.round(center.y - height / 2 + offset);
      const form = new FormData();
      form.set("file", file);
      form.set("expectedVersion", String(version.current));
      form.set("x", String(x));
      form.set("y", String(y));
      form.set("width", String(width));
      form.set("height", String(height));
      form.set("title", (file.name || "Pasted image").slice(0, 120));

      setSave("saving");
      const response = await fetch(`/api/boards/${board.id}/images`, {
        method: "POST",
        body: form,
      }).catch(() => null);
      if (!response) {
        setSave("error");
        setError("Network error while uploading the image. Try again.");
        return;
      }
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        conflict?: boolean;
        version?: number;
        id?: string;
        imageId?: string;
        imageUrl?: string;
      } | null;
      if (
        !response.ok ||
        !result?.id ||
        !result.imageId ||
        !result.imageUrl ||
        result.version === undefined
      ) {
        setSave("error");
        setError(result?.error ?? "Could not save the image. Try again.");
        if (result?.conflict) {
          dead.current = true;
          setConflict(true);
        }
        return;
      }

      version.current = result.version;
      setSave("saved");
      setError(null);
      const view: BoardNodeView = {
        id: result.id,
        kind: "image",
        imageId: result.imageId,
        imageUrl: result.imageUrl,
        width,
        height,
        zIndex: 0,
        locked: false,
        hidden: false,
        parentId: null,
        style: null,
        x,
        y,
        status: "confirmed",
        title: file.name || "Pasted image",
        text: null,
        dmNote: null,
        arcId: null,
        link: null,
        detail: null,
      };
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        { ...toFlowNode(view, colorMap), selected: true },
      ]);
      setSelection({ nodes: [view.id], edges: [] });
      recordAdded(view);
    });
  };
  useEffect(() => {
    imagePaste.current = (file) => void pasteImage(file);
  });

  const duplicateSelection = async () => {
    if (selection.nodes.length === 0) return;
    const view = await snapshot();
    if (!view) return;
    pasteCount.current = 0;
    await pasteSpecs(
      collectCopy(view.nodes, view.edges, new Set(selection.nodes)),
    );
  };

  const bulkPatch = (
    ids: string[],
    redoOf: (id: string) => Record<string, unknown>,
    undoOf: (id: string) => Record<string, unknown>,
  ) =>
    act(
      {
        redo: [
          {
            name: "updateNodes",
            input: {
              patches: ids.map((id) => ({ nodeId: id, ...redoOf(id) })),
            },
          },
        ],
        undo: [
          {
            name: "updateNodes",
            input: {
              patches: ids.map((id) => ({ nodeId: id, ...undoOf(id) })),
            },
          },
        ],
      },
      selection.nodes,
    );

  const toggleLock = () => {
    const ids = selection.nodes;
    if (ids.length === 0) return;
    const lock = !ids.every((id) => lockedIds.has(id));
    return bulkPatch(
      ids,
      () => ({ locked: lock }),
      (id) => ({ locked: lockedIds.has(id) }),
    );
  };

  const hideSelected = () => {
    const ids = selection.nodes;
    if (ids.length === 0) return;
    const hide = !ids.every((id) => dataOf(id)?.hidden);
    return bulkPatch(
      ids,
      () => ({ hidden: hide }),
      (id) => ({ hidden: !!dataOf(id)?.hidden }),
    );
  };

  const changeLayer = (action: "front" | "back" | "forward" | "backward") => {
    const sel = new Set(movable);
    const info = nodesRef.current
      .filter((n) => sel.has(n.id))
      .map((n) => ({
        id: n.id,
        zIndex: n.zIndex ?? 0,
        frame: n.type === "frame",
      }));
    const targets = new Map<string, number>();
    for (const frame of [false, true]) {
      const group = info.filter((i) => i.frame === frame);
      const others = nodesRef.current
        .filter((n) => !sel.has(n.id) && (n.type === "frame") === frame)
        .map((n) => n.zIndex ?? 0);
      reorderLayers(group, others, action).forEach((z, id) =>
        targets.set(id, z),
      );
    }
    if (targets.size === 0) return;
    const ids = [...targets.keys()];
    const before = new Map(info.map((i) => [i.id, i.zIndex]));
    return bulkPatch(
      ids,
      (id) => ({ zIndex: targets.get(id) }),
      (id) => ({ zIndex: before.get(id) }),
    );
  };

  const boxOf = (id: string) => {
    const n = getInternalNode(id);
    const abs = n?.internals.positionAbsolute;
    if (!n || !abs) return null;
    const { w, h } = sizeOf(n);
    return { id, x: abs.x, y: abs.y, w, h };
  };

  /** Moves cards to new absolute spots; a moved frame carries its unselected children. */
  const applyMoves = async (targets: Map<string, { x: number; y: number }>) => {
    if (targets.size === 0) return;
    const redo: Pos[] = [];
    const undo: Pos[] = [];
    const add = (id: string, x: number, y: number) => {
      const was = absOf(id);
      if (!was) return;
      undo.push({ id, x: was.x, y: was.y });
      redo.push({ id, x, y });
    };
    for (const [id, t] of targets) {
      const was = absOf(id);
      add(id, t.x, t.y);
      if (was && nodesRef.current.find((n) => n.id === id)?.type === "frame") {
        for (const c of nodesRef.current.filter(
          (n) => n.parentId === id && !targets.has(n.id),
        )) {
          const ca = absOf(c.id);
          if (ca) add(c.id, ca.x + (t.x - was.x), ca.y + (t.y - was.y));
        }
      }
    }
    await act(
      {
        redo: [{ name: "moveNodes", input: { positions: redo } }],
        undo: [{ name: "moveNodes", input: { positions: undo } }],
      },
      selection.nodes,
    );
  };

  const selectedBoxes = () =>
    movable.map(boxOf).filter((b): b is NonNullable<typeof b> => b !== null);

  const align = (mode: AlignMode) =>
    applyMoves(alignBoxes(selectedBoxes(), mode));
  const distribute = (axis: "horizontal" | "vertical") =>
    applyMoves(distributeBoxes(selectedBoxes(), axis));

  const zoomToSelection = () =>
    fitView({
      nodes: selection.nodes.length
        ? selection.nodes.map((id) => ({ id }))
        : undefined,
      padding: 0.3,
      maxZoom: 1.5,
      duration: 300,
    });

  const selectAll = () =>
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        selected: !(n.data as CardData).hidden || showHidden,
      })),
    );

  const keys = useRef<Record<string, () => void>>({});
  const imagePaste = useRef<(file: File) => void>(() => {});
  useEffect(() => {
    keys.current = {
      undo: () => void undo(),
      redo: () => void redo(),
      copy: () => void copySelection(),
      paste: () => void pasteClipboard(),
      duplicate: () => void duplicateSelection(),
      all: selectAll,
      delete: () => void deleteSelected(),
      clear: () => setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      let action: string | null = null;
      if (mod && k === "z") action = e.shiftKey ? "redo" : "undo";
      else if (mod && k === "y") action = "redo";
      else if (mod && k === "c") action = "copy";
      else if (mod && k === "d") action = "duplicate";
      else if (mod && k === "a") action = "all";
      else if (!mod && (e.key === "Delete" || e.key === "Backspace"))
        action = "delete";
      else if (e.key === "Escape") action = "clear";
      if (!action) return;
      e.preventDefault();
      keys.current[action]?.();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const item = [...(e.clipboardData?.items ?? [])].find(
        (candidate) =>
          candidate.kind === "file" && candidate.type.startsWith("image/"),
      );
      const file =
        item?.getAsFile() ??
        [...(e.clipboardData?.files ?? [])].find((f) =>
          f.type.startsWith("image/"),
        ) ??
        null;
      if (file) {
        e.preventDefault();
        imagePaste.current(file);
      } else if (clipboardStore.current) {
        e.preventDefault();
        keys.current.paste?.();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const d = n.data as CardData;
        let next = n;
        if (d.hidden)
          next = showHidden
            ? { ...n, hidden: false, style: { ...n.style, opacity: 0.35 } }
            : { ...n, hidden: true };
        if (d.locked)
          next = {
            ...next,
            style: { ...next.style, outline: "1px dotted var(--muted)" },
          };
        return next;
      }),
    [nodes, showHidden],
  );

  const allLocked =
    selection.nodes.length > 0 &&
    selection.nodes.every((id) => lockedIds.has(id));
  const allHidden =
    selection.nodes.length > 0 &&
    selection.nodes.every(
      (id) =>
        (nodes.find((n) => n.id === id)?.data as CardData | undefined)?.hidden,
    );
  const noNodes = selection.nodes.length === 0;

  const selectedEdge = selection.edges.length === 1 ? selection.edges[0] : null;
  const selectedEdgeObj = edges.find((e) => e.id === selectedEdge);
  const detailNode = detail ? nodes.find((n) => n.id === detail.nodeId) : null;
  const freeData =
    detailNode && isFree(detailNode.type)
      ? (detailNode.data as unknown as FreeData)
      : null;
  const nodeData = detail
    ? (nodes.find((n) => n.id === detail.nodeId)?.data as CardData | undefined)
    : undefined;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm">
        <span
          role="status"
          className={`mr-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            save === "error"
              ? "bg-danger/15 text-danger"
              : save === "saving"
                ? "bg-foreground/10 text-muted"
                : "bg-primary/10 text-link"
          }`}
        >
          {save === "saving"
            ? "Saving…"
            : save === "error"
              ? "Not saved"
              : "All changes saved"}
        </span>
        <button
          type="button"
          aria-pressed={showNotes}
          onClick={() => setShowNotes((v) => !v)}
          className={`rounded-md border px-2.5 py-1 transition-colors ${showNotes ? "border-magic bg-magic/15 text-magic" : "border-border"}`}
        >
          {showNotes ? "Hide DM notes" : "Show DM notes"}
        </button>
        <span
          aria-hidden
          className="mx-1 hidden h-5 w-px bg-border sm:inline-block"
        />
        <AddCardMenu
          disabled={conflict}
          linkable={linkable}
          onOpen={async () => setLinkable(await fetchLinkable(board.id))}
          onAdd={addCard}
          onCreate={async (input) => {
            const r = await quickCreateRecord(board.id, input);
            if (!r.ok) return r.error;
            await addCard({ type: r.type, id: r.id }, "", "");
            setLinkable(await fetchLinkable(board.id));
            return null;
          }}
        />
        <span className="text-xs text-muted">Paste an image with Ctrl/⌘+V</span>
        <select
          aria-label="Add free-form element"
          disabled={conflict}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v.startsWith("shape:"))
              addFree("shape", v.slice(6) as BoardStyle["shape"]);
            else addFree(v as FreeKind);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1"
        >
          <option value="">Add element…</option>
          <option value="text">Text</option>
          <option value="sticky">Sticky note</option>
          <option value="frame">Frame</option>
          <option value="shape:rect">Shape: rectangle</option>
          <option value="shape:rounded">Shape: rounded</option>
          <option value="shape:ellipse">Shape: ellipse</option>
          <option value="shape:diamond">Shape: diamond</option>
        </select>
        <span
          aria-hidden
          className="mx-1 hidden h-5 w-px bg-border sm:inline-block"
        />
        <button
          type="button"
          disabled={conflict || histCount.undo === 0}
          onClick={undo}
          title="Undo (Ctrl/⌘ Z)"
          className="rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-foreground/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          disabled={conflict || histCount.redo === 0}
          onClick={redo}
          title="Redo (Ctrl/⌘ Shift Z)"
          className="rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-foreground/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          ↷ Redo
        </button>
        <button
          type="button"
          disabled={conflict || !hasClip}
          onClick={pasteClipboard}
          title="Paste (Ctrl/⌘ V)"
          className="rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-foreground/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Paste
        </button>
        <span
          aria-hidden
          className="mx-1 hidden h-5 w-px bg-border sm:inline-block"
        />
        <button
          type="button"
          aria-pressed={boxSelect}
          onClick={() => setBoxSelect((v) => !v)}
          title="Drag on empty space to select several. Shift-drag also works."
          className={`rounded-md border px-2.5 py-1 transition-colors ${boxSelect ? "border-primary bg-primary/10" : "border-border"}`}
        >
          {boxSelect ? "Select: drag box" : "Select: pan"}
        </button>
        <button
          type="button"
          onClick={zoomToSelection}
          className="rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-foreground/10"
        >
          {selection.nodes.length ? "Zoom to selection" : "Zoom to fit"}
        </button>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showMap}
            onChange={(e) => setShowMap(e.target.checked)}
          />
          Minimap
        </label>
        {hiddenCount > 0 ? (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show {hiddenCount} hidden
          </label>
        ) : null}
        <span
          aria-hidden
          className="mx-1 hidden h-5 w-px bg-border sm:inline-block"
        />
        <ArcMenu
          arcs={arcs}
          onAdd={addArc}
          onRemove={removeArc}
          disabled={conflict}
        />
        <span className="ml-auto text-xs text-muted">
          Drag from a card&apos;s bottom dot to another card to draw an arrow.
        </span>
      </div>
      {selection.nodes.length > 0 || selection.edges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm shadow-sm">
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">
            {selection.nodes.length + selection.edges.length} selected
          </span>
          <SelBtn disabled={conflict || noNodes} onClick={copySelection}>
            Copy
          </SelBtn>
          <SelBtn disabled={conflict || noNodes} onClick={duplicateSelection}>
            Duplicate
          </SelBtn>
          <SelBtn
            disabled={conflict || movable.length + selection.edges.length === 0}
            onClick={deleteSelected}
          >
            Delete
          </SelBtn>
          <SelBtn disabled={conflict || noNodes} onClick={toggleLock}>
            {allLocked ? "Unlock" : "Lock"}
          </SelBtn>
          <SelBtn disabled={conflict || noNodes} onClick={hideSelected}>
            {allHidden ? "Unhide" : "Hide"}
          </SelBtn>
          <select
            aria-label="Layer order"
            disabled={conflict || movable.length === 0}
            value=""
            onChange={(e) => {
              if (e.target.value)
                changeLayer(
                  e.target.value as "front" | "back" | "forward" | "backward",
                );
            }}
            className="rounded border border-border bg-surface px-1 py-0.5"
          >
            <option value="">Layer…</option>
            <option value="front">Bring to front</option>
            <option value="forward">Forward one</option>
            <option value="backward">Back one</option>
            <option value="back">Send to back</option>
          </select>
          <select
            aria-label="Align"
            disabled={conflict || movable.length < 2}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === "h" || v === "v")
                distribute(v === "h" ? "horizontal" : "vertical");
              else align(v as AlignMode);
            }}
            className="rounded border border-border bg-surface px-1 py-0.5"
          >
            <option value="">Align…</option>
            <option value="left">Left edges</option>
            <option value="center">Centers (horizontal)</option>
            <option value="right">Right edges</option>
            <option value="top">Top edges</option>
            <option value="middle">Middles (vertical)</option>
            <option value="bottom">Bottom edges</option>
            <option value="h" disabled={movable.length < 3}>
              Distribute horizontally
            </option>
            <option value="v" disabled={movable.length < 3}>
              Distribute vertically
            </option>
          </select>
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded border border-danger bg-surface px-3 py-2 text-sm text-danger"
        >
          {error}{" "}
          {conflict ? (
            <button
              type="button"
              className="underline"
              onClick={() => window.location.reload()}
            >
              Reload board
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
        <div
          id="board-canvas"
          className="min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border shadow-sm"
        >
          <ShowNotes.Provider value={showNotes}>
            <CardNotesEditor.Provider
              value={(nodeId, text) => {
                if (conflict) return;
                const node = nodesRef.current.find((n) => n.id === nodeId);
                if (!node || (node.data as CardData).locked) return;
                void (async () => {
                  const r = await saveNotesAction(board.id, nodeId, text);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setNodes((ns) =>
                    ns.map((n) =>
                      n.id === nodeId
                        ? { ...n, data: { ...n.data, cardNotes: r.text } }
                        : n,
                    ),
                  );
                })();
              }}
            >
              <ClueTextEditor.Provider
                value={(nodeId, text) => {
                  if (conflict) return;
                  const node = nodesRef.current.find((n) => n.id === nodeId);
                  if (!node || (node.data as CardData).locked) return;
                  void (async () => {
                    const r = await saveClue(board.id, nodeId, text);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    const saved = r.text ?? "";
                    setNodes((ns) =>
                      ns.map((n) =>
                        n.id === nodeId
                          ? {
                              ...n,
                              data: {
                                ...n.data,
                                recordText: r.text,
                                detail:
                                  saved.length > 140
                                    ? `${saved.slice(0, 139)}…`
                                    : saved || null,
                              },
                            }
                          : n,
                      ),
                    );
                  })();
                }}
              >
                <NoteTextEditor.Provider
                  value={(nodeId, text) => {
                    if (conflict) return;
                    const node = nodesRef.current.find((n) => n.id === nodeId);
                    if (!node || (node.data as CardData).locked) return;
                    void updateFree(nodeId, { text: text || null });
                  }}
                >
                  <ResizeContext.Provider value={resizeHandlers}>
                    <ReactFlow
                      nodes={displayNodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      onNodesChange={onNodesChange}
                      onConnect={(c) => !conflict && setPending(c)}
                      onNodeDragStart={onNodeDragStart}
                      onNodeDragStop={onNodeDragStop}
                      onMoveEnd={onMoveEnd}
                      onNodeClick={onNodeClick}
                      onSelectionChange={onSelectionChange}
                      deleteKeyCode={null}
                      selectionOnDrag={boxSelect}
                      panOnDrag={boxSelect ? [1, 2] : true}
                      multiSelectionKeyCode={["Meta", "Control"]}
                      nodesDraggable={!conflict}
                      nodesConnectable={!conflict}
                      defaultViewport={
                        board.viewport ?? { x: 0, y: 0, zoom: 1 }
                      }
                      minZoom={0.1}
                      maxZoom={2}
                      fitView={!board.viewport && board.nodes.length > 0}
                    >
                      <Background />
                      <Controls />
                      {showMap ? (
                        <MiniMap
                          pannable
                          zoomable
                          nodeColor={(n) => {
                            const d = n.data as CardData;
                            if (d.hidden) return "var(--border)";
                            if (d.kind === "frame") return "var(--border)";
                            const fill = d.style?.fill;
                            if (fill && fill !== "none") return fill;
                            return d.color ?? "var(--muted)";
                          }}
                        />
                      ) : null}
                    </ReactFlow>
                  </ResizeContext.Provider>
                </NoteTextEditor.Provider>
              </ClueTextEditor.Provider>
            </CardNotesEditor.Provider>
          </ShowNotes.Provider>
        </div>
        {detail && selection.nodes.length <= 1 ? (
          <aside className="w-full overflow-y-auto rounded-lg border border-border bg-surface p-4 text-sm shadow-sm md:w-80">
            <div className="flex items-start justify-between">
              <h2 className="font-semibold">
                {freeData
                  ? FREE_DEFAULTS[freeData.kind].label
                  : detail.loading
                    ? "Loading…"
                    : (detail.data?.title ?? "Unavailable")}
              </h2>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setDetail(null)}
                className="px-1"
              >
                ✕
              </button>
            </div>
            {freeData ? (
              <StyleEditor
                key={detail.nodeId}
                data={freeData}
                disabled={conflict || freeData.locked}
                onChange={(patch) => updateFree(detail.nodeId, patch)}
              />
            ) : detail.data ? (
              <>
                <p className="text-xs text-muted">{detail.data.kindLabel}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {detail.data.fields.map((f) => (
                    <div key={f.label} className="contents">
                      <dt className="text-muted">{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                {detail.data.body ? (
                  <p className="mt-2 whitespace-pre-wrap">{detail.data.body}</p>
                ) : null}
                {detail.data.backstory ? (
                  <details className="mt-2 rounded border border-border p-2">
                    <summary className="cursor-pointer font-medium">
                      Backstory
                    </summary>
                    <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap">
                      {detail.data.backstory}
                    </p>
                  </details>
                ) : null}
                {detail.data.href ? (
                  <Link
                    href={detail.data.href}
                    target="_blank"
                    className="mt-2 inline-block text-link underline"
                  >
                    Open full record ↗
                  </Link>
                ) : null}
                {nodeData?.sub === "encounter" ? (
                  <EncounterCreatures
                    key={`creatures:${detail.nodeId}`}
                    boardId={board.id}
                    nodeId={detail.nodeId}
                    disabled={conflict}
                    onChanged={() => refreshDetail(detail.nodeId)}
                  />
                ) : null}
                {nodeData ? (
                  <NodeControls
                    key={`controls:${detail.nodeId}`}
                    data={nodeData}
                    arcs={arcs}
                    disabled={conflict}
                    onChange={(patch) => updateNode(detail.nodeId, patch)}
                  />
                ) : null}
              </>
            ) : detail.loading ? null : (
              <p className="mt-2 text-muted">Could not load this card.</p>
            )}
          </aside>
        ) : null}
      </div>
      {selectedEdgeObj ? (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="edge-type">Selected arrow:</label>
          <select
            id="edge-type"
            disabled={conflict}
            value={(selectedEdgeObj.data as { type: EdgeType }).type}
            onChange={(e) =>
              changeEdgeType(selectedEdgeObj.id, e.target.value as EdgeType)
            }
            className="rounded border border-border bg-surface px-2 py-1"
          >
            {EDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDGE_LABELS[t]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            Thickness
            <select
              disabled={conflict}
              value={(selectedEdgeObj.data as EdgeData).style?.borderWidth ?? 2}
              onChange={(e) =>
                updateEdgeStyle(selectedEdgeObj.id, {
                  borderWidth: Number(e.target.value),
                })
              }
              className="rounded border border-border bg-surface px-2 py-1"
            >
              {[1, 2, 3, 5, 8].map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              disabled={conflict}
              checked={!!(selectedEdgeObj.data as EdgeData).style?.dashed}
              onChange={(e) =>
                updateEdgeStyle(selectedEdgeObj.id, {
                  dashed: e.target.checked,
                })
              }
            />
            Dashed
          </label>
        </div>
      ) : null}
      {pending ? (
        <EdgeDialog onCancel={() => setPending(null)} onConfirm={confirmEdge} />
      ) : null}
    </div>
  );
}

function NodeControls({
  data,
  arcs,
  disabled,
  onChange,
}: {
  data: CardData;
  arcs: { id: string; name: string }[];
  disabled: boolean;
  onChange: (patch: {
    status?: NodeStatus;
    dmNote?: string | null;
    arcId?: string | null;
  }) => void;
}) {
  const [note, setNote] = useState(data.dmNote ?? "");
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <label className="block">
        <span className="text-muted">Truth status</span>
        <select
          disabled={disabled}
          value={data.status}
          onChange={(e) => onChange({ status: e.target.value as NodeStatus })}
          className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
        >
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-muted">Story arc</span>
        <select
          disabled={disabled}
          value={data.arcId ?? ""}
          onChange={(e) => onChange({ arcId: e.target.value || null })}
          className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
        >
          <option value="">None</option>
          {arcs.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-muted">Private DM note (board only)</span>
        <textarea
          value={note}
          disabled={disabled}
          maxLength={20000}
          rows={4}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (data.dmNote ?? ""))
              onChange({ dmNote: note.trim() || null });
          }}
          className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
        />
      </label>
    </div>
  );
}

type QuickInput = Parameters<typeof quickCreateRecord>[1];
type AddTab = "existing" | "npc" | "clue" | "encounter" | "record" | "note";

const TAB_LABELS: Record<AddTab, string> = {
  existing: "Existing",
  npc: "New NPC",
  clue: "New clue",
  encounter: "New encounter",
  record: "New location / quest…",
  note: "Note",
};

const FIELD =
  "mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1";

function AddCardMenu({
  linkable,
  onOpen,
  onAdd,
  onCreate,
  disabled,
}: {
  linkable: LinkableItem[] | null;
  onOpen: () => void;
  onAdd: (
    link: { type: string; id: string } | null,
    title: string,
    text: string,
  ) => void;
  onCreate: (input: QuickInput) => Promise<string | null>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AddTab>("existing");
  const [pick, setPick] = useState("");
  const [title, setTitle] = useState("");
  const [npc, setNpc] = useState({
    name: "",
    role: "",
    race: "",
    characterClass: "",
    level: "",
    location: "",
  });
  const [enc, setEnc] = useState({ title: "", objective: "" });
  const [rec, setRec] = useState({
    recordKind: "location",
    name: "",
    summary: "",
  });
  const [clue, setClue] = useState({ name: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, LinkableItem[]>();
    for (const i of linkable ?? [])
      m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m];
  }, [linkable]);

  const create = async () => {
    if (busy) return;
    const input: QuickInput =
      tab === "npc"
        ? {
            kind: "npc",
            name: npc.name,
            role: npc.role,
            race: npc.race,
            characterClass: npc.characterClass,
            level: npc.level.trim() ? Number(npc.level) : null,
            location: npc.location,
          }
        : tab === "clue"
          ? {
              kind: "record",
              recordKind: "clue",
              name: clue.name,
              summary: clue.text,
            }
          : tab === "record"
            ? { kind: "record", ...rec }
            : { kind: "encounter", title: enc.title, objective: enc.objective };
    setBusy(true);
    const error = await onCreate(input);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error });
      return;
    }
    setMsg(null);
    setOpen(false);
    if (tab === "npc")
      setNpc({
        name: "",
        role: "",
        race: "",
        characterClass: "",
        level: "",
        location: "",
      });
    else if (tab === "clue") setClue({ name: "", text: "" });
    else if (tab === "record") setRec({ ...rec, name: "", summary: "" });
    else setEnc({ title: "", objective: "" });
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void create();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
          setMsg(null);
        }}
        className="rounded-md bg-primary px-3 py-1 font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
      >
        + Add
      </button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 w-80 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div role="tablist" className="mb-3 flex flex-wrap gap-1">
            {(Object.keys(TAB_LABELS) as AddTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setMsg(null);
                }}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  tab === t
                    ? "bg-primary text-on-primary"
                    : "bg-foreground/10 hover:bg-foreground/15"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {tab === "existing" ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-muted">Campaign record</span>
                <select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className={FIELD}
                >
                  <option value="">{linkable ? "Choose…" : "Loading…"}</option>
                  {groups.map(([g, items]) => (
                    <optgroup key={g} label={g}>
                      {items.map((i) => (
                        <option
                          key={`${i.type}:${i.id}`}
                          value={`${i.type}|${i.id}`}
                        >
                          {i.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!pick}
                onClick={() => {
                  const [type, id] = pick.split("|");
                  onAdd({ type, id }, "", "");
                  setPick("");
                  setOpen(false);
                }}
                className="rounded-md border border-border px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
              >
                Add card
              </button>
            </div>
          ) : null}

          {tab === "npc" ? (
            <div className="space-y-2" onKeyDown={submitOnEnter}>
              <label className="block">
                <span className="text-muted">Name</span>
                <input
                  autoFocus
                  value={npc.name}
                  maxLength={120}
                  onChange={(e) => setNpc({ ...npc, name: e.target.value })}
                  placeholder="e.g. Mira the innkeeper"
                  className={FIELD}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-muted">Role</span>
                  <input
                    value={npc.role}
                    onChange={(e) => setNpc({ ...npc, role: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="text-muted">Location</span>
                  <input
                    value={npc.location}
                    onChange={(e) =>
                      setNpc({ ...npc, location: e.target.value })
                    }
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="text-muted">Race</span>
                  <input
                    value={npc.race}
                    onChange={(e) => setNpc({ ...npc, race: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="text-muted">Class</span>
                  <input
                    value={npc.characterClass}
                    onChange={(e) =>
                      setNpc({ ...npc, characterClass: e.target.value })
                    }
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="text-muted">Level</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={npc.level}
                    onChange={(e) => setNpc({ ...npc, level: e.target.value })}
                    className={FIELD}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy || !npc.name.trim()}
                onClick={create}
                className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create NPC & add"}
              </button>
              <p className="text-xs text-muted">
                Saved to your NPC list. Add backstory and stats there later.
              </p>
            </div>
          ) : null}

          {tab === "encounter" ? (
            <div className="space-y-2" onKeyDown={submitOnEnter}>
              <label className="block">
                <span className="text-muted">Title</span>
                <input
                  autoFocus
                  value={enc.title}
                  maxLength={120}
                  onChange={(e) => setEnc({ ...enc, title: e.target.value })}
                  placeholder="e.g. Ambush at the bridge"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="text-muted">Objective (optional)</span>
                <input
                  value={enc.objective}
                  maxLength={500}
                  onChange={(e) =>
                    setEnc({ ...enc, objective: e.target.value })
                  }
                  className={FIELD}
                />
              </label>
              <button
                type="button"
                disabled={busy || !enc.title.trim()}
                onClick={create}
                className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create encounter & add"}
              </button>
              <p className="text-xs text-muted">
                Saved as a planned encounter. Add creatures from its card.
              </p>
            </div>
          ) : null}

          {tab === "clue" ? (
            <div className="space-y-2" onKeyDown={submitOnEnter}>
              <label className="block">
                <span className="text-muted">Clue title</span>
                <input
                  autoFocus
                  value={clue.name}
                  maxLength={120}
                  onChange={(e) => setClue({ ...clue, name: e.target.value })}
                  placeholder="e.g. The torn ledger page"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="text-muted">What it reveals (optional)</span>
                <input
                  value={clue.text}
                  onChange={(e) => setClue({ ...clue, text: e.target.value })}
                  placeholder="You can also write it on the card"
                  className={FIELD}
                />
              </label>
              <button
                type="button"
                disabled={busy || !clue.name.trim()}
                onClick={create}
                className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create & add"}
              </button>
              <p className="text-xs text-muted">
                Saved as a clue in this campaign&apos;s records. Click the card
                to edit its text in place.
              </p>
            </div>
          ) : null}

          {tab === "record" ? (
            <div className="space-y-2" onKeyDown={submitOnEnter}>
              <label className="block">
                <span className="text-muted">Type</span>
                <select
                  value={rec.recordKind}
                  onChange={(e) =>
                    setRec({ ...rec, recordKind: e.target.value })
                  }
                  className={FIELD}
                >
                  {RECORD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {RECORD_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-muted">Name</span>
                <input
                  autoFocus
                  value={rec.name}
                  maxLength={120}
                  onChange={(e) => setRec({ ...rec, name: e.target.value })}
                  placeholder="e.g. Dunmere, The Missing Ledger"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="text-muted">Summary (optional)</span>
                <input
                  value={rec.summary}
                  onChange={(e) => setRec({ ...rec, summary: e.target.value })}
                  className={FIELD}
                />
              </label>
              <button
                type="button"
                disabled={busy || !rec.name.trim()}
                onClick={create}
                className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create & add"}
              </button>
              <p className="text-xs text-muted">
                Saved to this campaign&apos;s records.
              </p>
            </div>
          ) : null}

          {tab === "note" ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-muted">Free note</span>
                <input
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title"
                  className={FIELD}
                />
              </label>
              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => {
                  onAdd(null, title.trim(), "");
                  setTitle("");
                  setOpen(false);
                }}
                className="rounded-md border border-border px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
              >
                Add note
              </button>
            </div>
          ) : null}

          {msg ? (
            <p
              role={msg.ok ? "status" : "alert"}
              className={`mt-2 text-xs ${msg.ok ? "text-link" : "text-danger"}`}
            >
              {msg.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EncounterCreatures({
  boardId,
  nodeId,
  disabled,
  onChanged,
}: {
  boardId: string;
  nodeId: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [view, setView] = useState<Awaited<
    ReturnType<typeof fetchBoardEncounter>
  > | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"monster" | "npc" | "player_character">(
    "monster",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; detail: string }[]
  >([]);
  const [qty, setQty] = useState("1");
  const [npcId, setNpcId] = useState("");
  const [hp, setHp] = useState("");
  const [ac, setAc] = useState("");
  const [pcId, setPcId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchBoardEncounter(boardId, nodeId).then((v) => {
      if (!live) return;
      setView(v);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [boardId, nodeId]);

  useEffect(() => {
    if (mode !== "monster" || query.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchMonsters(query);
      if (live) setResults(r);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, mode]);

  const run = async (
    op: () => ReturnType<typeof addEncounterCreature>,
    after?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await op();
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setView(r.view);
    after?.();
    onChanged();
  };

  if (!loaded) return <p className="mt-3 text-muted">Loading creatures…</p>;
  if (!view) return null;
  const field = "rounded-md border border-border bg-surface px-2 py-1 text-sm";
  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <h3 className="font-medium">Creatures ({view.creatures.length})</h3>
      {view.creatures.length === 0 ? (
        <p className="text-muted">None yet. Add some below.</p>
      ) : (
        <ul className="space-y-1">
          {view.creatures.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>
                {c.quantity > 1 ? `${c.quantity}× ` : ""}
                {c.label}
              </span>
              <button
                type="button"
                disabled={disabled || busy}
                aria-label={`Remove ${c.label}`}
                onClick={() =>
                  run(() => removeEncounterCreature(boardId, nodeId, c.id))
                }
                className="text-xs text-danger hover:underline disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        {(
          [
            ["monster", "Monster"],
            ["npc", "NPC"],
            ["player_character", "Player"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              mode === m
                ? "bg-primary text-on-primary"
                : "bg-foreground/10 hover:bg-foreground/15"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "monster" ? (
        <div className="space-y-1">
          <div className="flex gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library monsters"
              aria-label="Search library monsters"
              className={`min-w-0 flex-1 ${field}`}
            />
            <input
              type="number"
              min={1}
              max={50}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Quantity"
              className={`w-14 ${field}`}
            />
          </div>
          {query.trim().length >= 2 && shown.length === 0 ? (
            <p className="text-xs text-muted">No monsters match.</p>
          ) : null}
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    run(
                      () =>
                        addEncounterCreature(boardId, nodeId, {
                          kind: "monster",
                          ruleEntryId: m.id,
                          quantity: Number(qty) || 1,
                        }),
                      () => setQty("1"),
                    )
                  }
                  className="w-full rounded-md border border-border px-2 py-1 text-left hover:bg-foreground/10 disabled:opacity-40"
                >
                  <span className="font-medium">+ {m.name}</span>
                  <span className="block text-xs text-muted">{m.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {mode === "npc" ? (
        <div className="space-y-1">
          <select
            value={npcId}
            onChange={(e) => setNpcId(e.target.value)}
            aria-label="NPC"
            className={`w-full ${field}`}
          >
            <option value="">Choose an NPC…</option>
            {view.npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <input
              type="number"
              min={1}
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              placeholder="Max HP"
              aria-label="Max HP"
              className={`w-1/2 ${field}`}
            />
            <input
              type="number"
              min={0}
              value={ac}
              onChange={(e) => setAc(e.target.value)}
              placeholder="AC"
              aria-label="AC"
              className={`w-1/2 ${field}`}
            />
          </div>
          <button
            type="button"
            disabled={disabled || busy || !npcId || !hp || !ac}
            onClick={() =>
              run(
                () =>
                  addEncounterCreature(boardId, nodeId, {
                    kind: "npc",
                    npcId,
                    maxHp: Number(hp),
                    armorClass: Number(ac),
                  }),
                () => {
                  setNpcId("");
                  setHp("");
                  setAc("");
                },
              )
            }
            className="rounded-md border border-border px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
          >
            Add NPC
          </button>
          <p className="text-xs text-muted">
            NPCs have no stat block, so enter their HP and AC for this fight.
          </p>
        </div>
      ) : null}
      {mode === "player_character" ? (
        <div className="space-y-1">
          <select
            value={pcId}
            onChange={(e) => setPcId(e.target.value)}
            aria-label="Player character"
            className={`w-full ${field}`}
          >
            <option value="">Choose a character…</option>
            {view.playerCharacters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || busy || !pcId}
            onClick={() =>
              run(
                () =>
                  addEncounterCreature(boardId, nodeId, {
                    kind: "player_character",
                    playerCharacterId: pcId,
                  }),
                () => setPcId(""),
              )
            }
            className="rounded-md border border-border px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
          >
            Add player
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ArcMenu({
  arcs,
  onAdd,
  onRemove,
  disabled,
}: {
  arcs: { id: string; name: string; color: string }[];
  onAdd: (name: string, color: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b6ea5");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded border border-border px-2 py-1"
      >
        Story arcs ({arcs.length})
      </button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 w-72 space-y-2 rounded border border-border bg-surface p-3 shadow">
          <ul className="space-y-1">
            {arcs.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span>
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm align-middle"
                    style={{ background: a.color }}
                  />
                  {a.name}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(a.id)}
                  className="text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
            {arcs.length === 0 ? (
              <li className="text-muted">No arcs yet.</li>
            ) : null}
          </ul>
          <div className="flex gap-2 border-t border-border pt-2">
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Arc name"
              aria-label="Arc name"
              className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1"
            />
            <input
              type="color"
              value={color}
              aria-label="Arc color"
              onChange={(e) => setColor(e.target.value)}
            />
            <button
              type="button"
              disabled={disabled || !name.trim()}
              onClick={() => {
                onAdd(name.trim(), color);
                setName("");
              }}
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EdgeDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (type: EdgeType, label: string) => void;
}) {
  const [type, setType] = useState<EdgeType>("ally");
  const [label, setLabel] = useState("");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose relationship"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm space-y-3 rounded border border-border bg-surface p-4">
        <h2 className="font-semibold">Relationship</h2>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EdgeType)}
          className="block w-full rounded border border-border bg-surface px-2 py-1"
          aria-label="Relationship type"
        >
          {EDGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {EDGE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional label"
          aria-label="Optional label"
          className="block w-full rounded border border-border bg-surface px-2 py-1"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-3 py-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(type, label.trim())}
            className="rounded bg-primary px-3 py-1 text-on-primary"
          >
            Add arrow
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardCanvas({ board }: { board: BoardView }) {
  return (
    <ReactFlowProvider>
      <Canvas board={board} />
    </ReactFlowProvider>
  );
}

function SelBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border bg-surface px-2 py-0.5 transition-colors hover:bg-foreground/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
