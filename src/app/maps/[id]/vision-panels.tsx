"use client";

import type { Cover, TemplateShape } from "@/lib/battle-map-vision";
import type { MapToken } from "@/lib/validation/battle-map";

const FIELD =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";
const BTN =
  "rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40";

export type FogMode = "reveal" | "hide";
export type TemplateConfig = {
  shape: TemplateShape;
  sizeFeet: number;
  widthFeet: number;
};

export function FogPanel({
  enabled,
  revealedCount,
  mode,
  disabled,
  onMode,
  onEnabled,
  onRevealAll,
  onHideAll,
}: {
  enabled: boolean;
  revealedCount: number;
  mode: FogMode;
  disabled: boolean;
  onMode: (m: FogMode) => void;
  onEnabled: (on: boolean) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <section aria-label="Fog of war" className="space-y-2">
      <h2 className="font-medium">Fog of war</h2>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabled(e.target.checked)}
        />
        Hide unrevealed squares from players
      </label>
      {enabled ? (
        <>
          <div className="flex gap-1" role="group" aria-label="Fog brush">
            {(["reveal", "hide"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={`rounded-md border px-2.5 py-1 ${
                  mode === m
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface hover:bg-foreground/10"
                }`}
              >
                {m === "reveal" ? "Reveal" : "Hide"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Use the Fog tool and drag a rectangle to {mode} squares.{" "}
            {revealedCount} squares revealed. You always see fogged areas
            dimmed.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onRevealAll}
              className={BTN}
            >
              Reveal all
            </button>
            <button
              type="button"
              disabled={disabled || revealedCount === 0}
              onClick={onHideAll}
              className={BTN}
            >
              Hide all
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">
          Off: players see the whole map. Turn on to start with everything
          hidden, then reveal areas as the party explores.
        </p>
      )}
    </section>
  );
}

export function TemplatePanel({
  config,
  placed,
  affected,
  onChange,
  onClear,
}: {
  config: TemplateConfig;
  placed: boolean;
  affected: string[];
  onChange: (c: TemplateConfig) => void;
  onClear: () => void;
}) {
  return (
    <section aria-label="Area template" className="space-y-2">
      <h2 className="font-medium">Area template</h2>
      <div className="flex gap-2">
        <select
          aria-label="Template shape"
          value={config.shape}
          onChange={(e) =>
            onChange({ ...config, shape: e.target.value as TemplateShape })
          }
          className={FIELD}
        >
          <option value="circle">Sphere / circle</option>
          <option value="cone">Cone</option>
          <option value="line">Line</option>
          <option value="cube">Cube</option>
        </select>
        <input
          aria-label="Template size in feet"
          inputMode="numeric"
          defaultValue={config.sizeFeet}
          key={config.sizeFeet}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 5 && v <= 500)
              onChange({ ...config, sizeFeet: v });
          }}
          className={`${FIELD} w-20`}
        />
      </div>
      {config.shape === "line" ? (
        <label className="flex items-center gap-2">
          <span className="text-muted">Width (ft.)</span>
          <input
            aria-label="Line width in feet"
            inputMode="numeric"
            defaultValue={config.widthFeet}
            key={config.widthFeet}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 5 && v <= 100)
                onChange({ ...config, widthFeet: v });
            }}
            className={`${FIELD} w-20`}
          />
        </label>
      ) : null}
      <p className="text-xs text-muted">
        Size is the radius for a sphere, the length for a cone or line, and the
        side for a cube. Choose the Template tool, then press on a grid corner
        and drag to aim. A square counts when its center is inside the shape.
        Templates are previews and are not saved.
      </p>
      {placed ? (
        <div className="space-y-1">
          <p>
            <span className="text-muted">Caught: </span>
            {affected.length ? affected.join(", ") : "no tokens"}
          </p>
          <button type="button" onClick={onClear} className={BTN}>
            Clear template
          </button>
        </div>
      ) : null}
    </section>
  );
}

const COVER_LABEL: Record<Cover, string> = {
  none: "No cover",
  half: "Half cover (estimate)",
  "three-quarters": "Three-quarters cover (estimate)",
  total: "Total cover (estimate)",
};

export function SightPanel({
  others,
  targetId,
  result,
  onTarget,
}: {
  others: MapToken[];
  targetId: string;
  result: { los: boolean; cover: Cover } | null;
  onTarget: (id: string) => void;
}) {
  if (!others.length) return null;
  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-muted">Line of sight to</span>
        <select
          aria-label="Line of sight target"
          value={targetId}
          onChange={(e) => onTarget(e.target.value)}
          className={FIELD}
        >
          <option value="">Choose a token…</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label || "Unnamed token"}
            </option>
          ))}
        </select>
      </label>
      {result ? (
        <p>
          <strong>{result.los ? "Clear line" : "Blocked"}</strong> ·{" "}
          {COVER_LABEL[result.cover]}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-muted">
          Walls, closed doors and obstacles block; other creatures do not. Cover
          traces corner-to-corner lines and is a guide, not a ruling.
        </p>
      ) : null}
    </div>
  );
}
