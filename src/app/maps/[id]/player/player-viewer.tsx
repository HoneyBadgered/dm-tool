"use client";

import { useEffect, useRef, useState } from "react";
import type { MapDoc } from "@/lib/validation/battle-map";
import { LabelView, TokenShapeView, edgeLine } from "../map-editor";
import { getPlayerMapAction } from "../map-actions";

const POLL_MS = 3000;

export function PlayerViewer({
  mapId,
  background,
  initialVersion,
  initialDoc,
}: {
  mapId: string;
  background: { rev: number; width: number; height: number } | null;
  initialVersion: number;
  initialDoc: MapDoc;
}) {
  const [state, setState] = useState({
    version: initialVersion,
    doc: initialDoc,
  });
  const [offline, setOffline] = useState(false);
  const [vp, setVp] = useState({ x: 16, y: 16, zoom: 0.8 });
  const drag = useRef<{
    sx: number;
    sy: number;
    vx: number;
    vy: number;
  } | null>(null);
  const version = useRef(initialVersion);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const r = await getPlayerMapAction(mapId);
      if (stopped) return;
      if (!r.ok) {
        setOffline(true);
        return;
      }
      setOffline(false);
      if (r.version !== version.current) {
        version.current = r.version;
        setState({ version: r.version, doc: r.doc });
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [mapId]);

  const { doc } = state;
  const { cols, rows, cellSize: cs } = doc.settings;
  const edgeWidth = Math.max(4, cs * 0.09);
  const seen = new Set(doc.fog.revealed.map((c) => `${c.x}:${c.y}`));
  let fogPath = "";
  if (doc.fog.enabled)
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++)
        if (!seen.has(`${x}:${y}`))
          fogPath += `M${x * cs} ${y * cs}h${cs}v${cs}h${-cs}z`;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-[#0c0a09]">
      <svg
        role="img"
        aria-label="Encounter map, player view"
        className="h-full w-full select-none"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            sx: e.clientX,
            sy: e.clientY,
            vx: vp.x,
            vy: vp.y,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d)
            setVp((v) => ({
              ...v,
              x: d.vx + e.clientX - d.sx,
              y: d.vy + e.clientY - d.sy,
            }));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) =>
          setVp((v) => ({
            ...v,
            zoom: Math.min(
              3,
              Math.max(0.15, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9)),
            ),
          }))
        }
      >
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
          <rect width={cols * cs} height={rows * cs} fill="var(--map-floor)" />
          {background ? (
            <image
              href={`/api/maps/${mapId}/background?v=${background.rev}`}
              x={doc.settings.bgX}
              y={doc.settings.bgY}
              width={background.width * doc.settings.bgScale}
              height={background.height * doc.settings.bgScale}
              preserveAspectRatio="none"
            />
          ) : null}
          {doc.terrain.map((c) => (
            <rect
              key={`${c.x}:${c.y}`}
              x={c.x * cs}
              y={c.y * cs}
              width={cs}
              height={cs}
              fill={c.kind === "obstacle" ? "#57534e" : "rgba(180,120,20,0.3)"}
            />
          ))}
          <path
            d={`M0 0H${cols * cs}V${rows * cs}H0z`}
            fill="none"
            stroke="var(--map-wall)"
            strokeWidth={2}
          />
          {doc.labels.map((l) => (
            <LabelView
              key={l.id}
              label={l}
              cs={cs}
              selected={false}
              linked={false}
            />
          ))}
          {doc.walls.map((w) => (
            <line
              key={`w${w.d}:${w.x}:${w.y}`}
              {...edgeLine(w, cs)}
              stroke="var(--map-wall)"
              strokeWidth={edgeWidth}
              strokeLinecap="round"
            />
          ))}
          {doc.doors.map((d) => (
            <line
              key={`d${d.d}:${d.x}:${d.y}`}
              {...edgeLine(d, cs)}
              stroke={d.open ? "#16a34a" : "var(--map-door)"}
              strokeWidth={d.open ? edgeWidth * 0.6 : edgeWidth * 1.2}
              strokeDasharray={d.open ? `${cs * 0.12} ${cs * 0.1}` : undefined}
            />
          ))}
          {doc.tokens.map((t) => (
            <TokenShapeView
              key={t.id}
              token={t}
              cs={cs}
              selected={false}
              stats={null}
            />
          ))}
          {fogPath ? <path d={fogPath} fill="#0c0a09" /> : null}
        </g>
      </svg>
      {offline ? (
        <p
          role="status"
          className="absolute left-2 top-2 rounded bg-danger/15 px-2 py-1 text-xs text-danger"
        >
          Connection lost — retrying…
        </p>
      ) : null}
    </div>
  );
}
