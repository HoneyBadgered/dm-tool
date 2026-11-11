"use client";

import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  SHAPES,
  type BoardStyle,
  type FreeKind,
  type Shape,
} from "@/lib/validation/board";

export type FreeData = {
  kind: FreeKind;
  title: string;
  text: string | null;
  imageUrl?: string | null;
  style: BoardStyle | null;
  locked: boolean;
  [key: string]: unknown;
};

export type ResizeEnd = (
  id: string,
  params: { x: number; y: number; width: number; height: number },
) => void;

export type ResizeHandlers = {
  start: ResizeEnd;
  end: ResizeEnd;
};

export const ResizeContext = createContext<ResizeHandlers>({
  start: () => {},
  end: () => {},
});

export const FREE_DEFAULTS: Record<
  FreeKind,
  { width: number; height: number; style: BoardStyle; label: string }
> = {
  text: {
    width: 200,
    height: 60,
    style: { fontSize: 18 },
    label: "Text",
  },
  sticky: {
    width: 180,
    height: 140,
    style: { fill: "#fde68a", border: "#d4a017", borderWidth: 1, fontSize: 14 },
    label: "Sticky note",
  },
  shape: {
    width: 160,
    height: 100,
    style: {
      fill: "#dbeafe",
      border: "#3b82f6",
      borderWidth: 2,
      shape: "rounded",
      fontSize: 14,
    },
    label: "Shape",
  },
  frame: {
    width: 420,
    height: 300,
    style: { border: "#6b7280", borderWidth: 2, dashed: true },
    label: "Frame",
  },
  image: {
    width: 320,
    height: 240,
    style: {},
    label: "Image",
  },
};

export const SHAPE_LABELS: Record<Shape, string> = {
  rect: "Rectangle",
  rounded: "Rounded",
  ellipse: "Ellipse",
  diamond: "Diamond",
};

function Resizer({
  id,
  selected,
  locked,
  minWidth = 60,
  minHeight = 40,
}: {
  id: string;
  selected: boolean | undefined;
  locked: boolean;
  minWidth?: number;
  minHeight?: number;
}) {
  const handlers = useContext(ResizeContext);
  return (
    <NodeResizer
      isVisible={!!selected && !locked}
      minWidth={minWidth}
      minHeight={minHeight}
      onResizeStart={(_, p) => handlers.start(id, p)}
      onResizeEnd={(_, p) => handlers.end(id, p)}
    />
  );
}

const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </>
);

type P = NodeProps<Node<FreeData>>;

/** Free text sits on the themed canvas, so unset (or the old fixed dark default) follows the theme. */
const themedText = (color: string | undefined, legacy: string) =>
  !color || color === legacy ? "var(--foreground)" : color;

export function TextNode({ id, data, selected }: P) {
  const s = data.style ?? {};
  return (
    <div
      className="h-full w-full whitespace-pre-wrap break-words p-1"
      style={{
        color: themedText(s.textColor, "#1f2937"),
        fontSize: s.fontSize ?? 18,
        outline: selected ? "1px dashed var(--highlight)" : undefined,
      }}
    >
      <Resizer id={id} selected={selected} locked={data.locked} />
      {data.text || <span className="opacity-40">Empty text</span>}
      <Handles />
    </div>
  );
}

export function StickyNode({ id, data, selected }: P) {
  const s = data.style ?? {};
  return (
    <div
      className="h-full w-full overflow-hidden whitespace-pre-wrap break-words rounded-sm p-2 shadow-md"
      style={{
        background: s.fill ?? "#fde68a",
        border: `${s.borderWidth ?? 1}px solid ${s.border ?? "#d4a017"}`,
        color: s.textColor ?? "#1f2937",
        fontSize: s.fontSize ?? 14,
        outline: selected ? "2px solid var(--highlight)" : undefined,
      }}
    >
      <Resizer id={id} selected={selected} locked={data.locked} />
      {data.text || <span className="opacity-40">Empty note</span>}
      <Handles />
    </div>
  );
}

function ShapeSvg({ style }: { style: BoardStyle }) {
  const common = {
    fill: style.fill === "none" ? "none" : (style.fill ?? "#dbeafe"),
    stroke: style.border ?? "#3b82f6",
    strokeWidth: style.borderWidth ?? 2,
    strokeDasharray: style.dashed ? "8 5" : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const w = style.borderWidth ?? 2;
  const inset = w / 2;
  switch (style.shape ?? "rounded") {
    case "ellipse":
      return <ellipse cx="50%" cy="50%" rx="49%" ry="49%" {...common} />;
    case "diamond":
      return <polygon points="50,1 99,50 50,99 1,50" {...common} />;
    case "rect":
      return <rect x={inset} y={inset} width="99%" height="99%" {...common} />;
    default:
      return (
        <rect
          x={inset}
          y={inset}
          width="99%"
          height="99%"
          rx="12"
          {...common}
        />
      );
  }
}

export function ShapeNode({ id, data, selected }: P) {
  const s = data.style ?? {};
  const diamond = (s.shape ?? "rounded") === "diamond";
  return (
    <div
      className="relative h-full w-full"
      style={{ outline: selected ? "1px dashed var(--highlight)" : undefined }}
    >
      <Resizer id={id} selected={selected} locked={data.locked} />
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={diamond ? "0 0 100 100" : undefined}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <ShapeSvg style={s} />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden whitespace-pre-wrap break-words p-3 text-center"
        style={{
          color:
            s.textColor ??
            (s.fill === "none" ? "var(--foreground)" : "#1f2937"),
          fontSize: s.fontSize ?? 14,
        }}
      >
        {data.text}
      </div>
      <Handles />
    </div>
  );
}

export function FrameNode({ id, data, selected }: P) {
  const s = data.style ?? {};
  return (
    <div
      className="h-full w-full rounded"
      style={{
        border: `${s.borderWidth ?? 2}px ${s.dashed === false ? "solid" : "dashed"} ${s.border ?? "#6b7280"}`,
        background: s.fill && s.fill !== "none" ? `${s.fill}33` : "transparent",
        outline: selected ? "2px solid var(--highlight)" : undefined,
      }}
    >
      <Resizer
        id={id}
        selected={selected}
        locked={data.locked}
        minWidth={120}
        minHeight={80}
      />
      <div
        className="absolute -top-6 left-0 max-w-full truncate text-sm font-semibold"
        style={{ color: themedText(s.textColor, "#374151") }}
      >
        {data.title || "Frame"}
      </div>
    </div>
  );
}

export function ImageNode({ id, data, selected }: P) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded border border-border bg-surface shadow-md"
      style={{ outline: selected ? "2px solid var(--highlight)" : undefined }}
    >
      <Resizer id={id} selected={selected} locked={data.locked} />
      {data.imageUrl ? (
        <Image
          src={data.imageUrl}
          alt={data.title || "Pasted board image"}
          fill
          sizes="(max-width: 600px) 100vw, 600px"
          unoptimized
          loading={selected ? "eager" : "lazy"}
          draggable={false}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          Image unavailable
        </div>
      )}
      <Handles />
    </div>
  );
}

export const freeNodeTypes = {
  text: TextNode,
  sticky: StickyNode,
  shape: ShapeNode,
  frame: FrameNode,
  image: ImageNode,
};

/** Local state that commits after the user pauses, so dragging a colour picker is one save. */
function useDebounced<T>(value: T, delay: number, commit: (v: T) => void) {
  const first = useRef(true);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => latest.current(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
}

function ColorField({
  label,
  value,
  fallback,
  disabled,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? fallback);
  useDebounced(v, 400, (x) => {
    if (x !== (value ?? fallback)) onCommit(x);
  });
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <input
        type="color"
        disabled={disabled}
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label={label}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useDebounced(v, 400, (x) => {
    if (x !== value) onCommit(x);
  });
  return (
    <label className="block">
      <span className="text-muted">
        {label}: {v}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(Number(e.target.value))}
        className="block w-full"
      />
    </label>
  );
}

export type FreePatch = {
  text?: string | null;
  title?: string | null;
  style?: BoardStyle;
};

export function StyleEditor({
  data,
  disabled,
  onChange,
}: {
  data: FreeData;
  disabled: boolean;
  onChange: (patch: FreePatch) => void;
}) {
  const s = data.style ?? {};
  const d = FREE_DEFAULTS[data.kind].style;
  const isFrame = data.kind === "frame";
  const [text, setText] = useState(
    isFrame || data.kind === "image" ? data.title : (data.text ?? ""),
  );
  const style = (patch: BoardStyle) => onChange({ style: patch });

  if (data.kind === "image") {
    return (
      <div className="mt-3">
        <label className="block">
          <span className="text-muted">Image description</span>
          <input
            value={text}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const next = text.trim() || null;
              if (next !== data.title) onChange({ title: next });
            }}
            className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <label className="block">
        <span className="text-muted">{isFrame ? "Frame label" : "Text"}</span>
        {isFrame ? (
          <input
            value={text}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text !== data.title) onChange({ title: text.trim() || null });
            }}
            className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
          />
        ) : (
          <textarea
            value={text}
            disabled={disabled}
            maxLength={5000}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text !== (data.text ?? ""))
                onChange({ text: text.trim() ? text : null });
            }}
            className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
          />
        )}
      </label>
      {data.kind === "shape" ? (
        <label className="block">
          <span className="text-muted">Shape</span>
          <select
            disabled={disabled}
            value={s.shape ?? "rounded"}
            onChange={(e) => style({ shape: e.target.value as Shape })}
            className="mt-1 block w-full rounded border border-border bg-surface px-2 py-1"
          >
            {SHAPES.map((x) => (
              <option key={x} value={x}>
                {SHAPE_LABELS[x]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {data.kind !== "text" ? (
        <>
          {s.fill === "none" ? null : (
            <ColorField
              label="Fill"
              value={s.fill}
              fallback={d.fill ?? "#ffffff"}
              disabled={disabled}
              onCommit={(fill) => style({ fill })}
            />
          )}
          {data.kind === "shape" || isFrame ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={s.fill === "none"}
                onChange={(e) =>
                  style({
                    fill: e.target.checked ? "none" : (d.fill ?? "#dbeafe"),
                  })
                }
              />
              <span>No fill (border only)</span>
            </label>
          ) : null}
        </>
      ) : null}
      {data.kind !== "text" ? (
        <ColorField
          label="Border"
          value={s.border}
          fallback={d.border ?? "#6b7280"}
          disabled={disabled}
          onCommit={(border) => style({ border })}
        />
      ) : null}
      <ColorField
        label="Text color"
        value={s.textColor}
        fallback={d.textColor ?? "#1f2937"}
        disabled={disabled}
        onCommit={(textColor) => style({ textColor })}
      />
      {data.kind !== "text" ? (
        <NumberField
          label="Line thickness"
          value={s.borderWidth ?? d.borderWidth ?? 2}
          min={0}
          max={12}
          disabled={disabled}
          onCommit={(borderWidth) => style({ borderWidth })}
        />
      ) : null}
      {!isFrame ? (
        <NumberField
          label="Font size"
          value={s.fontSize ?? d.fontSize ?? 14}
          min={10}
          max={72}
          disabled={disabled}
          onCommit={(fontSize) => style({ fontSize })}
        />
      ) : null}
      {data.kind === "shape" || isFrame ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={s.dashed ?? d.dashed ?? false}
            onChange={(e) => style({ dashed: e.target.checked })}
          />
          <span>Dashed border</span>
        </label>
      ) : null}
    </div>
  );
}
