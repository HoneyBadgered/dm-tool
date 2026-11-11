"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  TOKEN_COLORS,
  addLabel,
  addToken,
  addWalls,
  cellInBounds,
  edgesAlong,
  eraseEdge,
  eraseTerrain,
  labelAt,
  moveToken,
  placeCombatantTokens,
  nearestEdge,
  paintTerrain,
  placeDoor,
  removeLabel,
  removeToken,
  revealAll,
  hideAll,
  rotateToken,
  setFogEnabled,
  setFogRect,
  toggleDoor,
  tokenAt,
  updateLabel,
  updateSettings,
  updateToken,
} from "@/lib/battle-map-ops";
import {
  MAP_LIMITS,
  type MapDoc,
  type MapLabel,
  type MapSettings,
  type MapToken,
  type TokenShape,
} from "@/lib/validation/battle-map";
import {
  linkKey,
  statsForToken,
  type MapCombatInfo,
  type RecordInfo,
  type TokenStats,
} from "@/lib/battle-map-links";
import { reachablePositions, squaresBetween } from "@/lib/battle-map-movement";
import type { BattleMapView } from "@/server/services/maps/battle-maps";
import {
  clearMapBackgroundAction,
  createLinkedMapAction,
  mapCombatCommandAction,
  refreshCombatInfoAction,
  saveMapAction,
  type CombatCommand,
} from "./map-actions";
import {
  estimateCover,
  hasLineOfSight,
  playerView,
  templateCells,
  tokensInCells,
} from "@/lib/battle-map-vision";
import {
  FogPanel,
  SightPanel,
  TemplatePanel,
  type FogMode,
  type TemplateConfig,
} from "./vision-panels";
import { CombatPanel, type OpenCombat } from "./combat-panel";
import { TokenPanel } from "./token-panel";

type Tool =
  | "select"
  | "pan"
  | "wall"
  | "door"
  | "difficult"
  | "obstacle"
  | "label"
  | "measure"
  | "template"
  | "fog"
  | "erase";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  {
    id: "select",
    label: "Select",
    hint: "Click a token to select it, drag to move it, or drag its round handle to rotate. Click a door to open or close it. Click a linked label to open its map.",
  },
  { id: "pan", label: "Pan", hint: "Drag to move around. Scroll to zoom." },
  {
    id: "wall",
    label: "Wall",
    hint: "Drag along grid lines to draw a straight wall.",
  },
  {
    id: "door",
    label: "Door",
    hint: "Click a grid edge to place a door. Click an existing door to open or close it.",
  },
  {
    id: "difficult",
    label: "Difficult",
    hint: "Click or drag to paint difficult terrain.",
  },
  {
    id: "obstacle",
    label: "Obstacle",
    hint: "Click or drag to paint obstacles such as pillars or boulders.",
  },
  {
    id: "label",
    label: "Label",
    hint: "Drag a rectangle to name a room or area, then link it to its own map. Click a label to edit it.",
  },
  {
    id: "measure",
    label: "Measure",
    hint: "Drag between two squares to measure the distance. Diagonals count as one square.",
  },
  {
    id: "template",
    label: "Template",
    hint: "Press on a grid corner and drag to aim an area of effect. Pick the shape and size in the sidebar.",
  },
  {
    id: "fog",
    label: "Fog",
    hint: "Drag a rectangle to reveal or hide squares for the players. Turn on fog of war in the sidebar first.",
  },
  {
    id: "erase",
    label: "Erase",
    hint: "Click or drag to erase terrain, walls, and doors. Tokens are removed with Delete.",
  },
];

const SIZES = [
  { v: 1, label: "Medium (1×1)" },
  { v: 2, label: "Large (2×2)" },
  { v: 3, label: "Huge (3×3)" },
  { v: 4, label: "Gargantuan (4×4)" },
];

type Viewport = { x: number; y: number; zoom: number };

type Interaction =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "move"; id: string; dx: number; dy: number; x: number; y: number }
  | { kind: "rotate"; id: string }
  | { kind: "wall"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "paint" }
  | { kind: "measure" }
  | { kind: "template" }
  | { kind: "fog"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "label"; x1: number; y1: number; x2: number; y2: number };

type History = { past: MapDoc[]; present: MapDoc; future: MapDoc[] };

const HISTORY_LIMIT = 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const newId = () => crypto.randomUUID().slice(0, 12);
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable);

type Measurement = { x1: number; y1: number; x2: number; y2: number };

export function MapEditor({
  map,
  otherMaps,
  combat: initialCombat,
  records: initialRecords,
  openCombats,
}: {
  map: BattleMapView;
  otherMaps: { id: string; name: string }[];
  combat: MapCombatInfo | null;
  records: Record<string, RecordInfo>;
  openCombats: OpenCombat[];
}) {
  const router = useRouter();
  const [maps, setMaps] = useState(otherMaps);
  const [combat, setCombat] = useState(initialCombat);
  const [records, setRecords] = useState(initialRecords);
  const [measure, setMeasure] = useState<Measurement | null>(null);
  const [showRange, setShowRange] = useState(false);
  const [playerMode, setPlayerMode] = useState(false);
  const [fogMode, setFogMode] = useState<FogMode>("reveal");
  const [tplConfig, setTplConfig] = useState<TemplateConfig>({
    shape: "circle",
    sizeFeet: 20,
    widthFeet: 5,
  });
  const [tplAim, setTplAim] = useState<{
    ox: number;
    oy: number;
    tx: number;
    ty: number;
  } | null>(null);
  const [sightTargetId, setSightTargetId] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [history, setHistory] = useState<History>({
    past: [],
    present: map.doc,
    future: [],
  });
  const [draft, setDraft] = useState<MapDoc | null>(null);
  const [ix, setIx] = useState<Interaction | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vp, setVp] = useState<Viewport>({ x: 24, y: 24, zoom: 0.8 });
  const [bg, setBg] = useState(map.background);
  const [version, setVersion] = useState(map.version);
  const [savedDoc, setSavedDoc] = useState(map.doc);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{
    label: string;
    color: string;
    size: number;
    shape: TokenShape;
  }>({ label: "", color: TOKEN_COLORS[0], size: 1, shape: "circle" });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitted = useRef(false);

  const doc = history.present;
  const live = draft ?? doc;
  const shown: MapDoc =
    ix?.kind === "move" ? moveToken(live, ix.id, ix.x, ix.y) : live;
  const { cols, rows, cellSize: cs, feetPerCell } = shown.settings;
  const view = playerMode ? playerView(shown) : shown;
  const selected = shown.tokens.find((t) => t.id === selectedId) ?? null;
  const sightTarget = selected
    ? (shown.tokens.find(
        (t) => t.id === sightTargetId && t.id !== selected.id,
      ) ?? null)
    : null;
  const sightResult =
    selected && sightTarget
      ? {
          los: hasLineOfSight(shown, selected, sightTarget),
          cover: estimateCover(shown, selected, sightTarget).cover,
        }
      : null;
  const tplCells = tplAim
    ? templateCells(shown, {
        ...tplConfig,
        origin: { x: tplAim.ox, y: tplAim.oy },
        toward: { x: tplAim.tx, y: tplAim.ty },
      })
    : [];
  const tplTokens = tplAim ? tokensInCells(shown, tplCells) : [];
  const fogPath = (() => {
    if (!shown.fog.enabled) return "";
    const seen = new Set(shown.fog.revealed.map((c) => `${c.x}:${c.y}`));
    let d = "";
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++)
        if (!seen.has(`${x}:${y}`))
          d += `M${x * cs} ${y * cs}h${cs}v${cs}h${-cs}z`;
    return d;
  })();
  const selectedLabel =
    shown.labels.find((l) => l.id === selectedLabelId) ?? null;
  const dirty = doc !== savedDoc;
  const selectedStats = selected
    ? statsForToken(selected, combat, records)
    : null;
  const rangeSpeed = selected
    ? (selected.speed ?? selectedStats?.speed ?? null)
    : null;
  const rangeCells = new Set<string>();
  if (showRange && selected && rangeSpeed !== null) {
    const budget = Math.floor(rangeSpeed / feetPerCell);
    for (const key of reachablePositions(shown, selected, budget).keys()) {
      const [px, py] = key.split(":").map(Number);
      for (let dx = 0; dx < selected.size; dx++)
        for (let dy = 0; dy < selected.size; dy++)
          rangeCells.add(`${px + dx}:${py + dy}`);
    }
  }
  const combatantTokenIds = new Set(
    doc.tokens.flatMap((t) =>
      t.link?.kind === "combatant" ? [t.link.id] : [],
    ),
  );
  const missingCombatants = (combat?.combatants ?? []).filter(
    (c) => c.status !== "removed" && !combatantTokenIds.has(c.id),
  );

  const commit = (next: MapDoc) => {
    if (conflict || next === doc) return;
    setSaveError(null);
    setHistory((h) => ({
      past: [...h.past.slice(-(HISTORY_LIMIT - 1)), h.present],
      present: next,
      future: [],
    }));
  };
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );

  // Autosave shortly after the last change.
  useEffect(() => {
    if (!dirty || saving || conflict || saveError || draft || ix) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      const r = await saveMapAction(map.id, version, doc);
      setSaving(false);
      if (r.ok) {
        setVersion(r.version);
        setSavedDoc(doc);
      } else {
        if (r.conflict) setConflict(true);
        setSaveError(r.error);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, saving, conflict, saveError, draft, ix, doc, version, map.id]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setVp((v) => {
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.1, 4);
        const k = zoom / v.zoom;
        return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (!selected || conflict) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(removeToken(doc, selected.id));
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        commit(moveToken(doc, selected.id, selected.x + dx, selected.y + dy));
      } else if (e.key.toLowerCase() === "r") {
        commit(rotateToken(doc, selected.id, e.shiftKey ? -45 : 45));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fitTo = (el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const zoom = clamp(
      Math.min((r.width - 48) / (cols * cs), (r.height - 48) / (rows * cs)),
      0.1,
      2,
    );
    setVp({
      zoom,
      x: (r.width - cols * cs * zoom) / 2,
      y: (r.height - rows * cs * zoom) / 2,
    });
  };
  const zoomBy = (factor: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setVp((v) => {
      const zoom = clamp(v.zoom * factor, 0.1, 4);
      const k = zoom / v.zoom;
      return {
        zoom,
        x: r.width / 2 - (r.width / 2 - v.x) * k,
        y: r.height / 2 - (r.height / 2 - v.y) * k,
      };
    });
  };

  const toCells = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const wx = (e.clientX - r.left - vp.x) / vp.zoom;
    const wy = (e.clientY - r.top - vp.y) / vp.zoom;
    return { fx: wx / cs, fy: wy / cs, wx, wy };
  };

  const rotateHandle = (t: MapToken) => {
    const w = t.size * cs;
    const a = (t.rotation * Math.PI) / 180;
    const r = w / 2 + 16;
    return {
      x: t.x * cs + w / 2 + Math.sin(a) * r,
      y: t.y * cs + w / 2 - Math.cos(a) * r,
    };
  };

  const applyBrush = (
    d: MapDoc,
    fx: number,
    fy: number,
    mode: Tool,
  ): MapDoc => {
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (mode === "difficult" || mode === "obstacle")
      return paintTerrain(d, x, y, mode);
    if (mode === "erase") {
      let next = eraseTerrain(d, x, y);
      const e = nearestEdge(fx, fy);
      if (e.distance < 0.25) next = eraseEdge(next, e);
      return next;
    }
    return d;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { fx, fy, wx, wy } = toCells(e);
    if (e.button === 1 || tool === "pan" || playerMode) {
      e.preventDefault();
      setIx({ kind: "pan", sx: e.clientX, sy: e.clientY, vx: vp.x, vy: vp.y });
      return;
    }
    if (conflict) return;
    if (tool === "select") {
      if (selected) {
        const h = rotateHandle(selected);
        if (Math.hypot(wx - h.x, wy - h.y) <= 14 / vp.zoom) {
          setIx({ kind: "rotate", id: selected.id });
          return;
        }
      }
      const hit = cellInBounds(doc, Math.floor(fx), Math.floor(fy))
        ? tokenAt(doc, Math.floor(fx), Math.floor(fy))
        : null;
      if (hit) {
        setSelectedId(hit.id);
        setIx({
          kind: "move",
          id: hit.id,
          dx: Math.floor(fx) - hit.x,
          dy: Math.floor(fy) - hit.y,
          x: hit.x,
          y: hit.y,
        });
        return;
      }
      setSelectedId(null);
      const edge = nearestEdge(fx, fy);
      const onDoor =
        edge.distance < 0.2 &&
        doc.doors.some(
          (d) => d.x === edge.x && d.y === edge.y && d.d === edge.d,
        );
      if (onDoor) {
        commit(toggleDoor(doc, edge));
        return;
      }
      const label = labelAt(doc, Math.floor(fx), Math.floor(fy));
      if (label?.linkMapId) openMap(label.linkMapId);
      else setSelectedLabelId(label?.id ?? null);
      return;
    }
    if (tool === "measure") {
      const x = clamp(Math.floor(fx), 0, cols - 1);
      const y = clamp(Math.floor(fy), 0, rows - 1);
      setMeasure({ x1: x, y1: y, x2: x, y2: y });
      setIx({ kind: "measure" });
      return;
    }
    if (tool === "template") {
      setTplAim({ ox: Math.round(fx), oy: Math.round(fy), tx: fx, ty: fy });
      setIx({ kind: "template" });
      return;
    }
    if (tool === "fog") {
      if (!doc.fog.enabled) {
        setMessage("Turn on fog of war in the sidebar first.");
        return;
      }
      const x = clamp(Math.floor(fx), 0, cols - 1);
      const y = clamp(Math.floor(fy), 0, rows - 1);
      setIx({ kind: "fog", x1: x, y1: y, x2: x, y2: y });
      return;
    }
    if (tool === "label") {
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const hit = cellInBounds(doc, x, y) ? labelAt(doc, x, y) : null;
      if (hit) {
        setSelectedLabelId(hit.id);
        return;
      }
      if (!cellInBounds(doc, x, y)) return;
      setSelectedLabelId(null);
      setIx({ kind: "label", x1: x, y1: y, x2: x, y2: y });
      return;
    }
    if (tool === "wall") {
      const x = clamp(Math.round(fx), 0, cols);
      const y = clamp(Math.round(fy), 0, rows);
      setIx({ kind: "wall", x1: x, y1: y, x2: x, y2: y });
      return;
    }
    if (tool === "door") {
      const edge = nearestEdge(fx, fy);
      const exists = doc.doors.some(
        (d) => d.x === edge.x && d.y === edge.y && d.d === edge.d,
      );
      commit(exists ? toggleDoor(doc, edge) : placeDoor(doc, edge));
      return;
    }
    setIx({ kind: "paint" });
    setDraft(applyBrush(doc, fx, fy, tool));
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!ix) return;
    if (ix.kind === "pan") {
      setVp((v) => ({
        ...v,
        x: ix.vx + e.clientX - ix.sx,
        y: ix.vy + e.clientY - ix.sy,
      }));
      return;
    }
    const { fx, fy } = toCells(e);
    if (ix.kind === "move") {
      setIx({
        ...ix,
        x: Math.floor(fx) - ix.dx,
        y: Math.floor(fy) - ix.dy,
      });
    } else if (ix.kind === "rotate") {
      const t = doc.tokens.find((k) => k.id === ix.id);
      if (!t) return;
      const deg =
        (Math.atan2(fy - (t.y + t.size / 2), fx - (t.x + t.size / 2)) * 180) /
          Math.PI +
        90;
      const snapped = Math.round(deg / 15) * 15;
      setDraft(updateToken(doc, ix.id, { rotation: snapped }));
    } else if (ix.kind === "measure") {
      setMeasure((m) =>
        m
          ? {
              ...m,
              x2: clamp(Math.floor(fx), 0, cols - 1),
              y2: clamp(Math.floor(fy), 0, rows - 1),
            }
          : m,
      );
    } else if (ix.kind === "template") {
      setTplAim((a) => (a ? { ...a, tx: fx, ty: fy } : a));
    } else if (ix.kind === "fog") {
      setIx({
        ...ix,
        x2: clamp(Math.floor(fx), 0, cols - 1),
        y2: clamp(Math.floor(fy), 0, rows - 1),
      });
    } else if (ix.kind === "label") {
      setIx({
        ...ix,
        x2: clamp(Math.floor(fx), 0, cols - 1),
        y2: clamp(Math.floor(fy), 0, rows - 1),
      });
    } else if (ix.kind === "wall") {
      setIx({
        ...ix,
        x2: clamp(Math.round(fx), 0, cols),
        y2: clamp(Math.round(fy), 0, rows),
      });
    } else if (ix.kind === "paint") {
      setDraft((d) => applyBrush(d ?? doc, fx, fy, tool));
    }
  };

  const endInteraction = () => {
    if (!ix) return;
    if (ix.kind === "move") {
      commit(moveToken(doc, ix.id, ix.x, ix.y));
    } else if (ix.kind === "fog") {
      commit(setFogRect(doc, ix.x1, ix.y1, ix.x2, ix.y2, fogMode === "reveal"));
    } else if (ix.kind === "wall") {
      commit(addWalls(doc, edgesAlong(ix.x1, ix.y1, ix.x2, ix.y2)));
    } else if (ix.kind === "label") {
      const id = newId();
      const next = addLabel(doc, {
        id,
        text: "New area",
        x: Math.min(ix.x1, ix.x2),
        y: Math.min(ix.y1, ix.y2),
        w: Math.abs(ix.x2 - ix.x1) + 1,
        h: Math.abs(ix.y2 - ix.y1) + 1,
        linkMapId: null,
      });
      if (next !== doc) {
        commit(next);
        setSelectedLabelId(id);
      }
    } else if (draft) {
      commit(draft);
    }
    setDraft(null);
    setIx(null);
  };

  const openMap = (id: string) => {
    if (dirty || saving || saveError || conflict) {
      setMessage("Wait for this map to finish saving before opening another.");
      return;
    }
    router.push(`/maps/${id}`);
  };

  const runCombatCommand = async (command: CombatCommand) => {
    if (!combat || commandBusy) return;
    setCommandBusy(true);
    setMessage(null);
    const r = await mapCombatCommandAction(map.id, combat.version, command);
    if (r.ok) setCombat(r.info);
    else {
      setMessage(r.error);
      if (r.stale) {
        const fresh = await refreshCombatInfoAction(map.id);
        if (fresh.ok) setCombat(fresh.info);
      }
    }
    setCommandBusy(false);
  };

  const addCombatantTokens = () => {
    const next = placeCombatantTokens(doc, missingCombatants, newId);
    if (next === doc) {
      setMessage("There is no free space or token room for more combatants.");
      return;
    }
    setMessage(
      next.tokens.length - doc.tokens.length < missingCombatants.length
        ? "Some combatants did not fit on the map."
        : null,
    );
    commit(next);
  };

  const createRoomMap = async () => {
    if (!selectedLabel || conflict) return;
    const r = await createLinkedMapAction(map.id, selectedLabel.text);
    if (!r.ok) {
      setMessage("Could not create the map.");
      return;
    }
    setMaps((m) => [...m, { id: r.id, name: r.name }]);
    commit(updateLabel(doc, selectedLabel.id, { linkMapId: r.id }));
  };

  const addNewToken = () => {
    const el = svgRef.current;
    let x = 0;
    let y = 0;
    if (el) {
      const c = toCells({
        clientX: el.getBoundingClientRect().left + el.clientWidth / 2,
        clientY: el.getBoundingClientRect().top + el.clientHeight / 2,
      });
      x = Math.floor(c.fx);
      y = Math.floor(c.fy);
    }
    let spot = { x: clamp(x, 0, cols - 1), y: clamp(y, 0, rows - 1) };
    for (let i = 0; i < 40 && tokenAt(doc, spot.x, spot.y); i++)
      spot = {
        x: (spot.x + 1) % cols,
        y: spot.y + (spot.x + 1 >= cols ? 1 : 0),
      };
    const token = {
      id: newId(),
      label: newToken.label.trim().slice(0, 40),
      size: newToken.size,
      color: newToken.color,
      shape: newToken.shape,
      ...spot,
    };
    const next = addToken(doc, token);
    if (next === doc || next.tokens.length === doc.tokens.length) {
      setMessage(`A map holds up to ${MAP_LIMITS.maxTokens} tokens.`);
      return;
    }
    setMessage(null);
    commit(next);
    setSelectedId(token.id);
    setNewToken((t) => ({ ...t, label: "" }));
  };

  const changeSettings = (patch: Partial<MapSettings>) =>
    commit(updateSettings(doc, patch));

  const uploadBackground = async (file: File) => {
    setMessage(null);
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      const body = new FormData();
      body.set("file", file);
      body.set("width", String(width));
      body.set("height", String(height));
      const res = await fetch(`/api/maps/${map.id}/background`, {
        method: "POST",
        body,
      });
      const result = (await res.json().catch(() => null)) as {
        error?: string;
        rev?: number;
      } | null;
      if (!res.ok || !result?.rev) {
        setMessage(result?.error ?? "Could not upload the image.");
        return;
      }
      setBg({ rev: result.rev, width, height });
      commit(
        updateSettings(doc, {
          cols: clamp(
            Math.round(width / doc.settings.cellSize),
            MAP_LIMITS.minCells,
            MAP_LIMITS.maxCols,
          ),
          rows: clamp(
            Math.round(height / doc.settings.cellSize),
            MAP_LIMITS.minCells,
            MAP_LIMITS.maxRows,
          ),
          bgScale: 1,
          bgX: 0,
          bgY: 0,
        }),
      );
    } catch {
      setMessage("That file could not be read as an image.");
    }
  };

  const removeBackground = async () => {
    const r = await clearMapBackgroundAction(map.id);
    if (r.ok) setBg(null);
    else setMessage("Could not remove the image.");
  };

  const status = conflict
    ? "Changed elsewhere"
    : saveError
      ? "Not saved"
      : saving
        ? "Saving…"
        : dirty
          ? "Unsaved changes"
          : "Saved";
  const hint = TOOLS.find((t) => t.id === tool)?.hint;
  const cursor =
    tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  const edgeWidth = Math.max(4, cs * 0.09);
  const preview =
    ix?.kind === "wall" ? edgesAlong(ix.x1, ix.y1, ix.x2, ix.y2) : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <div
            role="toolbar"
            aria-label="Map tools"
            className="flex flex-wrap gap-1"
          >
            {(playerMode ? [] : TOOLS).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                onClick={() => {
                  setTool(t.id);
                  setMeasure(null);
                }}
                className={`rounded-md border px-2.5 py-1 ${
                  tool === t.id
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface hover:bg-foreground/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={undo}
            disabled={!history.past.length || conflict}
            className="rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!history.future.length || conflict}
            className="rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
          >
            Redo
          </button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.25)}
            className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-foreground/10"
          >
            −
          </button>
          <span className="w-12 text-center tabular-nums text-muted">
            {Math.round(vp.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.25)}
            className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-foreground/10"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => svgRef.current && fitTo(svgRef.current)}
            className="rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10"
          >
            Fit
          </button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            aria-pressed={playerMode}
            onClick={() => {
              setPlayerMode((v) => !v);
              setTool("select");
              setMeasure(null);
            }}
            className={`rounded-md border px-2.5 py-1 ${
              playerMode
                ? "border-primary bg-primary text-on-primary"
                : "border-border bg-surface hover:bg-foreground/10"
            }`}
          >
            {playerMode ? "Player view (on)" : "Player view"}
          </button>
          <a
            href={`/maps/${map.id}/player`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10"
          >
            Open player screen ↗
          </a>
          <span
            role="status"
            className={`ml-auto ${conflict || saveError ? "text-danger" : "text-muted"}`}
          >
            {status}
          </span>
          {saveError && !conflict ? (
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="rounded-md border border-border bg-surface px-2 py-1 hover:bg-foreground/10"
            >
              Retry
            </button>
          ) : null}
        </div>

        {conflict || saveError || message ? (
          <p role="alert" className="text-sm text-danger">
            {conflict
              ? "This map was changed in another tab. Reload to continue; your latest edits here were not saved."
              : (message ?? saveError)}
          </p>
        ) : null}

        <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border bg-(--map-surround) shadow-sm">
          <svg
            ref={(el) => {
              svgRef.current = el;
              if (el && !fitted.current) {
                fitted.current = true;
                fitTo(el);
              }
            }}
            role="application"
            aria-label="Encounter map"
            className="h-full w-full select-none"
            style={{ cursor, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            onContextMenu={(e) => e.preventDefault()}
          >
            <defs>
              <pattern
                id="grid"
                width={cs}
                height={cs}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${cs} 0 L 0 0 0 ${cs}`}
                  fill="none"
                  stroke="var(--map-grid)"
                  strokeWidth={1}
                />
              </pattern>
              <pattern
                id="difficult"
                width={12}
                height={12}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={12} height={12} fill="rgba(180,120,20,0.25)" />
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={12}
                  stroke="rgba(130,80,10,0.75)"
                  strokeWidth={3}
                />
              </pattern>
            </defs>
            <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
              <rect
                width={cols * cs}
                height={rows * cs}
                fill="var(--map-floor)"
              />
              {bg ? (
                <image
                  href={`/api/maps/${map.id}/background?v=${bg.rev}`}
                  x={shown.settings.bgX}
                  y={shown.settings.bgY}
                  width={bg.width * shown.settings.bgScale}
                  height={bg.height * shown.settings.bgScale}
                  preserveAspectRatio="none"
                  clipPath="url(#mapclip)"
                />
              ) : null}
              <clipPath id="mapclip">
                <rect width={cols * cs} height={rows * cs} />
              </clipPath>
              {view.terrain.map((c) =>
                c.kind === "difficult" ? (
                  <rect
                    key={`${c.x}:${c.y}`}
                    x={c.x * cs}
                    y={c.y * cs}
                    width={cs}
                    height={cs}
                    fill="url(#difficult)"
                  />
                ) : (
                  <rect
                    key={`${c.x}:${c.y}`}
                    x={c.x * cs + 2}
                    y={c.y * cs + 2}
                    width={cs - 4}
                    height={cs - 4}
                    rx={4}
                    fill="#57534e"
                    stroke="#292524"
                    strokeWidth={2}
                  />
                ),
              )}
              <rect
                width={cols * cs}
                height={rows * cs}
                fill="url(#grid)"
                stroke="var(--map-wall)"
                strokeWidth={2}
                pointerEvents="none"
              />
              {view.labels.map((l) => (
                <LabelView
                  key={l.id}
                  label={l}
                  cs={cs}
                  selected={l.id === selectedLabelId}
                  linked={maps.some((m) => m.id === l.linkMapId)}
                />
              ))}
              {ix?.kind === "label" ? (
                <rect
                  x={Math.min(ix.x1, ix.x2) * cs}
                  y={Math.min(ix.y1, ix.y2) * cs}
                  width={(Math.abs(ix.x2 - ix.x1) + 1) * cs}
                  height={(Math.abs(ix.y2 - ix.y1) + 1) * cs}
                  fill="rgba(37,99,235,0.15)"
                  stroke="#2563eb"
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              ) : null}
              {view.walls.map((w) => (
                <line
                  key={`w${w.d}:${w.x}:${w.y}`}
                  {...edgeLine(w, cs)}
                  stroke="var(--map-wall)"
                  strokeWidth={edgeWidth}
                  strokeLinecap="round"
                />
              ))}
              {view.doors.map((d) => (
                <line
                  key={`d${d.d}:${d.x}:${d.y}`}
                  {...edgeLine(d, cs)}
                  stroke={d.open ? "#16a34a" : "var(--map-door)"}
                  strokeWidth={d.open ? edgeWidth * 0.6 : edgeWidth * 1.2}
                  strokeDasharray={
                    d.open ? `${cs * 0.12} ${cs * 0.1}` : undefined
                  }
                />
              ))}
              {preview.map((e) => (
                <line
                  key={`p${e.d}:${e.x}:${e.y}`}
                  {...edgeLine(e, cs)}
                  stroke="var(--map-wall)"
                  strokeOpacity={0.5}
                  strokeWidth={edgeWidth}
                  strokeLinecap="round"
                />
              ))}
              {rangeCells.size
                ? [...rangeCells].map((key) => {
                    const [rx, ry] = key.split(":").map(Number);
                    return (
                      <rect
                        key={`r${key}`}
                        x={rx * cs + 1}
                        y={ry * cs + 1}
                        width={cs - 2}
                        height={cs - 2}
                        fill="rgba(37,99,235,0.28)"
                        stroke="rgba(37,99,235,0.7)"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    );
                  })
                : null}
              {view.tokens.map((t) => (
                <TokenShapeView
                  key={t.id}
                  token={t}
                  cs={cs}
                  selected={t.id === selectedId}
                  stats={statsForToken(t, combat, records)}
                />
              ))}
              {fogPath ? (
                <path
                  d={fogPath}
                  fill={playerMode ? "#0c0a09" : "rgba(12,10,9,0.45)"}
                  pointerEvents="none"
                />
              ) : null}
              {tplAim
                ? tplCells.map((c) => (
                    <rect
                      key={`t${c.x}:${c.y}`}
                      x={c.x * cs}
                      y={c.y * cs}
                      width={cs}
                      height={cs}
                      fill="rgba(220,38,38,0.3)"
                      stroke="rgba(220,38,38,0.7)"
                      pointerEvents="none"
                    />
                  ))
                : null}
              {tplAim ? (
                <g pointerEvents="none">
                  <circle
                    cx={tplAim.ox * cs}
                    cy={tplAim.oy * cs}
                    r={6}
                    fill="#dc2626"
                  />
                  <line
                    x1={tplAim.ox * cs}
                    y1={tplAim.oy * cs}
                    x2={tplAim.tx * cs}
                    y2={tplAim.ty * cs}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                </g>
              ) : null}
              {ix?.kind === "fog" ? (
                <rect
                  x={Math.min(ix.x1, ix.x2) * cs}
                  y={Math.min(ix.y1, ix.y2) * cs}
                  width={(Math.abs(ix.x2 - ix.x1) + 1) * cs}
                  height={(Math.abs(ix.y2 - ix.y1) + 1) * cs}
                  fill={
                    fogMode === "reveal"
                      ? "rgba(250,204,21,0.3)"
                      : "rgba(12,10,9,0.4)"
                  }
                  stroke="#ca8a04"
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              ) : null}
              {selected && sightTarget && sightResult && !playerMode ? (
                <line
                  x1={(selected.x + selected.size / 2) * cs}
                  y1={(selected.y + selected.size / 2) * cs}
                  x2={(sightTarget.x + sightTarget.size / 2) * cs}
                  y2={(sightTarget.y + sightTarget.size / 2) * cs}
                  stroke={sightResult.los ? "#16a34a" : "#dc2626"}
                  strokeWidth={3}
                  strokeDasharray="8 5"
                  pointerEvents="none"
                />
              ) : null}
              {measure ? (
                <MeasureView
                  m={measure}
                  cs={cs}
                  feetPerCell={feetPerCell}
                  zoom={vp.zoom}
                />
              ) : null}
              {selected && !playerMode ? (
                <RotateHandle token={selected} cs={cs} />
              ) : null}
            </g>
          </svg>
        </div>
        <p className="text-xs text-muted">
          1 square = {feetPerCell} ft · {cols}×{rows} squares · {hint}
        </p>
      </div>

      <aside
        hidden={playerMode}
        className="w-full shrink-0 space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-3 text-sm md:w-72"
      >
        <FogPanel
          enabled={shown.fog.enabled}
          revealedCount={shown.fog.revealed.length}
          mode={fogMode}
          disabled={conflict}
          onMode={(m) => {
            setFogMode(m);
            setTool("fog");
          }}
          onEnabled={(on) => commit(setFogEnabled(doc, on))}
          onRevealAll={() => commit(revealAll(doc))}
          onHideAll={() => commit(hideAll(doc))}
        />
        <TemplatePanel
          config={tplConfig}
          placed={tplAim !== null}
          affected={tplTokens.map((t) => t.label || "Unnamed token")}
          onChange={(c) => {
            setTplConfig(c);
            setTool("template");
          }}
          onClear={() => setTplAim(null)}
        />
        <section aria-label="Add token" className="space-y-2">
          <h2 className="font-medium">Add token</h2>
          <label className="block">
            <span className="text-muted">Label</span>
            <input
              value={newToken.label}
              maxLength={40}
              onChange={(e) =>
                setNewToken({ ...newToken, label: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") addNewToken();
              }}
              placeholder="e.g. Goblin 1"
              className={FIELD}
            />
          </label>
          <ColorPicker
            value={newToken.color}
            onChange={(color) => setNewToken({ ...newToken, color })}
          />
          <div className="flex gap-2">
            <select
              aria-label="Token size"
              value={newToken.size}
              onChange={(e) =>
                setNewToken({ ...newToken, size: Number(e.target.value) })
              }
              className={`${FIELD} flex-1`}
            >
              {SIZES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Token shape"
              value={newToken.shape}
              onChange={(e) =>
                setNewToken({
                  ...newToken,
                  shape: e.target.value as TokenShape,
                })
              }
              className={FIELD}
            >
              <option value="circle">Round</option>
              <option value="square">Square</option>
            </select>
          </div>
          <button
            type="button"
            disabled={conflict}
            onClick={addNewToken}
            className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
          >
            Add to map
          </button>
        </section>

        {selected ? (
          <section aria-label="Selected token" className="space-y-2">
            <h2 className="font-medium">Selected token</h2>
            <label className="block">
              <span className="text-muted">Label</span>
              <input
                key={`${selected.id}:${selected.label}`}
                defaultValue={selected.label}
                maxLength={40}
                disabled={conflict}
                onBlur={(e) => {
                  if (e.target.value.trim() !== selected.label)
                    commit(
                      updateToken(doc, selected.id, {
                        label: e.target.value.trim(),
                      }),
                    );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={FIELD}
              />
            </label>
            <ColorPicker
              value={selected.color}
              onChange={(color) =>
                commit(updateToken(doc, selected.id, { color }))
              }
            />
            <div className="flex gap-2">
              <select
                aria-label="Selected token size"
                value={selected.size}
                disabled={conflict}
                onChange={(e) =>
                  commit(
                    updateToken(doc, selected.id, {
                      size: Number(e.target.value),
                    }),
                  )
                }
                className={`${FIELD} flex-1`}
              >
                {SIZES.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Selected token shape"
                value={selected.shape}
                disabled={conflict}
                onChange={(e) =>
                  commit(
                    updateToken(doc, selected.id, {
                      shape: e.target.value as TokenShape,
                    }),
                  )
                }
                className={FIELD}
              >
                <option value="circle">Round</option>
                <option value="square">Square</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Facing {selected.rotation}°</span>
              <button
                type="button"
                aria-label="Rotate left 45 degrees"
                disabled={conflict}
                onClick={() => commit(rotateToken(doc, selected.id, -45))}
                className={SMALL_BTN}
              >
                ↺
              </button>
              <button
                type="button"
                aria-label="Rotate right 45 degrees"
                disabled={conflict}
                onClick={() => commit(rotateToken(doc, selected.id, 45))}
                className={SMALL_BTN}
              >
                ↻
              </button>
            </div>
            <TokenPanel
              key={selected.id}
              mapId={map.id}
              token={selected}
              stats={selectedStats}
              combat={combat}
              disabled={conflict}
              showRange={showRange}
              rangeSpeed={rangeSpeed}
              busy={commandBusy}
              onPatch={(patch) => commit(updateToken(doc, selected.id, patch))}
              onRecord={(r) =>
                setRecords((all) => ({
                  ...all,
                  [linkKey({ kind: r.kind, id: r.id })]: r,
                }))
              }
              onToggleRange={setShowRange}
              onCommand={runCombatCommand}
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.dmOnly}
                disabled={conflict}
                onChange={(e) =>
                  commit(
                    updateToken(doc, selected.id, { dmOnly: e.target.checked }),
                  )
                }
              />
              DM only (hidden from players)
            </label>
            <SightPanel
              others={shown.tokens.filter((t) => t.id !== selected.id)}
              targetId={sightTarget?.id ?? ""}
              result={sightResult}
              onTarget={setSightTargetId}
            />
            <button
              type="button"
              disabled={conflict}
              onClick={() => {
                commit(removeToken(doc, selected.id));
                setSelectedId(null);
              }}
              className="rounded-md border border-danger px-2.5 py-1 text-danger hover:bg-danger/15 disabled:opacity-40"
            >
              Remove token
            </button>
          </section>
        ) : null}

        {selectedLabel ? (
          <section aria-label="Selected label" className="space-y-2">
            <h2 className="font-medium">Label</h2>
            <label className="block">
              <span className="text-muted">Name</span>
              <input
                key={`${selectedLabel.id}:${selectedLabel.text}`}
                defaultValue={selectedLabel.text}
                maxLength={MAP_LIMITS.maxLabelText}
                disabled={conflict}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== selectedLabel.text)
                    commit(updateLabel(doc, selectedLabel.id, { text: v }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={FIELD}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedLabel.dmOnly}
                disabled={conflict}
                onChange={(e) =>
                  commit(
                    updateLabel(doc, selectedLabel.id, {
                      dmOnly: e.target.checked,
                    }),
                  )
                }
              />
              DM only (hidden from players)
            </label>
            <label className="block">
              <span className="text-muted">Opens map</span>
              <select
                value={
                  maps.some((m) => m.id === selectedLabel.linkMapId)
                    ? (selectedLabel.linkMapId ?? "")
                    : ""
                }
                disabled={conflict}
                onChange={(e) =>
                  commit(
                    updateLabel(doc, selectedLabel.id, {
                      linkMapId: e.target.value || null,
                    }),
                  )
                }
                className={FIELD}
              >
                <option value="">No link</option>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={conflict}
                onClick={createRoomMap}
                className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
              >
                Create new map
              </button>
              {selectedLabel.linkMapId &&
              maps.some((m) => m.id === selectedLabel.linkMapId) ? (
                <button
                  type="button"
                  onClick={() => openMap(selectedLabel.linkMapId!)}
                  className={SMALL_BTN}
                >
                  Open map
                </button>
              ) : null}
              <button
                type="button"
                disabled={conflict}
                onClick={() => {
                  commit(removeLabel(doc, selectedLabel.id));
                  setSelectedLabelId(null);
                }}
                className="rounded-md border border-danger px-2.5 py-1 text-danger hover:bg-danger/15 disabled:opacity-40"
              >
                Remove label
              </button>
            </div>
            <p className="text-xs text-muted">
              Create new map makes a blank map named after this label and links
              it. With the Select tool, clicking a linked label opens its map.
            </p>
          </section>
        ) : null}

        <CombatPanel
          mapId={map.id}
          combat={combat}
          openCombats={openCombats}
          disabled={conflict}
          missingCount={missingCombatants.length}
          onCombat={setCombat}
          onAddTokens={addCombatantTokens}
          onError={setMessage}
        />

        <section aria-label="Grid" className="space-y-2">
          <h2 className="font-medium">Grid</h2>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Columns"
              value={cols}
              min={MAP_LIMITS.minCells}
              max={MAP_LIMITS.maxCols}
              disabled={conflict}
              onApply={(v) => changeSettings({ cols: v })}
            />
            <NumberField
              label="Rows"
              value={rows}
              min={MAP_LIMITS.minCells}
              max={MAP_LIMITS.maxRows}
              disabled={conflict}
              onApply={(v) => changeSettings({ rows: v })}
            />
            <NumberField
              label="Square size (px)"
              value={cs}
              min={MAP_LIMITS.minCellSize}
              max={MAP_LIMITS.maxCellSize}
              disabled={conflict}
              onApply={(v) => changeSettings({ cellSize: v })}
            />
            <NumberField
              label="Feet per square"
              value={feetPerCell}
              min={1}
              max={MAP_LIMITS.maxFeetPerCell}
              disabled={conflict}
              onApply={(v) => changeSettings({ feetPerCell: v })}
            />
          </div>
          <button
            type="button"
            disabled={conflict}
            onClick={() =>
              changeSettings({ cols: 100, rows: 100, cellSize: 20 })
            }
            className={SMALL_BTN}
          >
            Zoomed-out overview (100×100)
          </button>
          <p className="text-xs text-muted">
            Shrinking the grid removes anything outside it. You can undo.
          </p>
        </section>

        <section aria-label="Background image" className="space-y-2">
          <h2 className="font-medium">Background image</h2>
          <label className="block">
            <span className="text-muted">
              {bg ? "Replace image" : "Import image"} (PNG, JPEG, WebP, max 5
              MB)
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={conflict}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadBackground(file);
              }}
              className="mt-1 block w-full text-xs"
            />
          </label>
          {bg ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <NumberField
                  label="Scale"
                  value={shown.settings.bgScale}
                  min={0.05}
                  max={20}
                  step={0.05}
                  decimals
                  disabled={conflict}
                  onApply={(v) => changeSettings({ bgScale: v })}
                />
                <NumberField
                  label="Offset X"
                  value={Math.round(shown.settings.bgX)}
                  min={-50000}
                  max={50000}
                  disabled={conflict}
                  onApply={(v) => changeSettings({ bgX: v })}
                />
                <NumberField
                  label="Offset Y"
                  value={Math.round(shown.settings.bgY)}
                  min={-50000}
                  max={50000}
                  disabled={conflict}
                  onApply={(v) => changeSettings({ bgY: v })}
                />
              </div>
              <p className="text-xs text-muted">
                Match the image&apos;s own squares to the grid by changing
                Square size or Scale.
              </p>
              <button
                type="button"
                disabled={conflict}
                onClick={removeBackground}
                className="rounded-md border border-border px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
              >
                Remove image
              </button>
            </>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

const FIELD =
  "mt-1 block w-full rounded-md border border-border bg-background px-2 py-1";
const SMALL_BTN =
  "rounded-md border border-border px-2 py-0.5 hover:bg-foreground/10 disabled:opacity-40";

export function LabelView({
  label: l,
  cs,
  selected,
  linked,
}: {
  label: MapLabel;
  cs: number;
  selected: boolean;
  linked: boolean;
}) {
  const w = l.w * cs;
  const h = l.h * cs;
  const size = clamp(
    Math.min((w * 0.9) / (l.text.length * 0.6), h * 0.5),
    10,
    cs * 1.5,
  );
  return (
    <g pointerEvents="none" opacity={l.dmOnly ? 0.55 : 1}>
      <rect
        x={l.x * cs}
        y={l.y * cs}
        width={w}
        height={h}
        fill={linked ? "rgba(37,99,235,0.12)" : "rgba(120,113,108,0.12)"}
        stroke={selected ? "#1d4ed8" : linked ? "#2563eb" : "#78716c"}
        strokeWidth={selected ? 4 : 2}
        strokeDasharray={linked ? undefined : "8 5"}
      />
      <text
        x={l.x * cs + w / 2}
        y={l.y * cs + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
        fontWeight={600}
        fill="var(--map-ink)"
        stroke="var(--map-floor)"
        strokeWidth={size * 0.12}
        paintOrder="stroke"
      >
        {linked ? `${l.text} ↗` : l.text}
      </text>
    </g>
  );
}

export function edgeLine(
  e: { x: number; y: number; d: "h" | "v" },
  cs: number,
) {
  return e.d === "h"
    ? { x1: e.x * cs, y1: e.y * cs, x2: (e.x + 1) * cs, y2: e.y * cs }
    : { x1: e.x * cs, y1: e.y * cs, x2: e.x * cs, y2: (e.y + 1) * cs };
}

const RING = { ally: "#15803d", hostile: "#b91c1c", neutral: "#a16207" };

export function TokenShapeView({
  token: t,
  cs,
  selected,
  stats,
}: {
  token: MapToken;
  cs: number;
  selected: boolean;
  stats: TokenStats | null;
}) {
  const w = t.size * cs;
  const label = t.label.length > 10 ? `${t.label.slice(0, 9)}…` : t.label;
  const inset = 3;
  const ring = RING[t.disposition];
  const dash = t.disposition === "neutral" ? "9 5" : undefined;
  const hpFraction =
    stats && stats.source === "combatant" && stats.maxHp
      ? Math.min(1, Math.max(0, (stats.hp ?? 0) / stats.maxHp))
      : null;
  return (
    <g
      transform={`translate(${t.x * cs} ${t.y * cs})`}
      pointerEvents="none"
      aria-label={`${t.label || "Token"}, ${t.disposition}${stats?.isActive ? ", active turn" : ""}`}
      opacity={stats?.defeated ? 0.45 : t.dmOnly ? 0.55 : 1}
    >
      {stats?.isActive ? (
        <rect
          x={-3}
          y={-3}
          width={w + 6}
          height={w + 6}
          rx={t.shape === "circle" ? (w + 6) / 2 : 10}
          fill="none"
          stroke="#2563eb"
          strokeWidth={4}
        />
      ) : null}
      <g transform={`rotate(${t.rotation} ${w / 2} ${w / 2})`}>
        {t.shape === "circle" ? (
          <circle
            cx={w / 2}
            cy={w / 2}
            r={w / 2 - inset}
            fill={t.color}
            stroke={selected ? "#facc15" : ring}
            strokeWidth={selected ? 5 : 4}
            strokeDasharray={selected ? undefined : dash}
          />
        ) : (
          <rect
            x={inset}
            y={inset}
            width={w - inset * 2}
            height={w - inset * 2}
            rx={6}
            fill={t.color}
            stroke={selected ? "#facc15" : ring}
            strokeWidth={selected ? 5 : 4}
            strokeDasharray={selected ? undefined : dash}
          />
        )}
        <polygon
          points={`${w / 2 - 8},${inset + 1} ${w / 2 + 8},${inset + 1} ${w / 2},${inset - 9}`}
          fill="#ffffff"
          stroke="#1c1917"
          strokeWidth={1.5}
        />
      </g>
      {hpFraction !== null ? (
        <g>
          <rect
            x={w * 0.15}
            y={w - 10}
            width={w * 0.7}
            height={6}
            rx={3}
            fill="#1c1917"
            stroke="#ffffff"
            strokeWidth={1}
          />
          <rect
            x={w * 0.15}
            y={w - 10}
            width={w * 0.7 * hpFraction}
            height={6}
            rx={3}
            fill={
              hpFraction > 0.5
                ? "#22c55e"
                : hpFraction > 0.25
                  ? "#eab308"
                  : "#ef4444"
            }
          />
        </g>
      ) : null}
      {stats?.defeated ? (
        <text
          x={w / 2}
          y={w / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={w * 0.6}
          fill="#ffffff"
          stroke="#1c1917"
          strokeWidth={3}
          paintOrder="stroke"
        >
          ✕
        </text>
      ) : null}
      {label ? (
        <text
          x={w / 2}
          y={w / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(w * 0.28, 20)}
          fontWeight={600}
          fill="#ffffff"
          stroke="#1c1917"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function MeasureView({
  m,
  cs,
  feetPerCell,
  zoom,
}: {
  m: Measurement;
  cs: number;
  feetPerCell: number;
  zoom: number;
}) {
  const squares = squaresBetween(m.x1, m.y1, m.x2, m.y2);
  const ax = (m.x1 + 0.5) * cs;
  const ay = (m.y1 + 0.5) * cs;
  const bx = (m.x2 + 0.5) * cs;
  const by = (m.y2 + 0.5) * cs;
  const text = `${squares} sq · ${squares * feetPerCell} ft`;
  const size = 14 / zoom;
  return (
    <g pointerEvents="none">
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="#7c3aed"
        strokeWidth={3 / zoom}
        strokeDasharray={`${8 / zoom} ${5 / zoom}`}
      />
      <circle cx={ax} cy={ay} r={5 / zoom} fill="#7c3aed" />
      <circle cx={bx} cy={by} r={5 / zoom} fill="#7c3aed" />
      <text
        x={(ax + bx) / 2}
        y={(ay + by) / 2 - 10 / zoom}
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        fill="#ffffff"
        stroke="#4c1d95"
        strokeWidth={4 / zoom}
        paintOrder="stroke"
      >
        {text}
      </text>
    </g>
  );
}

function RotateHandle({ token: t, cs }: { token: MapToken; cs: number }) {
  const w = t.size * cs;
  return (
    <g
      transform={`translate(${t.x * cs} ${t.y * cs}) rotate(${t.rotation} ${w / 2} ${w / 2})`}
      pointerEvents="none"
    >
      <line
        x1={w / 2}
        y1={0}
        x2={w / 2}
        y2={-16}
        stroke="#facc15"
        strokeWidth={2}
      />
      <circle
        cx={w / 2}
        cy={-16}
        r={6}
        fill="#facc15"
        stroke="#1c1917"
        strokeWidth={1.5}
      />
    </g>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div role="group" aria-label="Token color" className="flex gap-1.5">
      {TOKEN_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={`h-6 w-6 rounded-full border-2 ${
            value === c ? "border-foreground" : "border-on-primary"
          }`}
        />
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  decimals = false,
  disabled,
  onApply,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: boolean;
  disabled: boolean;
  onApply: (v: number) => void;
}) {
  const apply = (el: HTMLInputElement) => {
    const n = Number(el.value);
    if (!Number.isFinite(n) || el.value.trim() === "") {
      el.value = String(value);
      return;
    }
    const v = clamp(decimals ? n : Math.round(n), min, max);
    el.value = String(v);
    if (v !== value) onApply(v);
  };
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        key={`${label}:${value}`}
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onBlur={(e) => apply(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply(e.currentTarget);
        }}
        className={FIELD}
      />
    </label>
  );
}
