"use client";

import { useState } from "react";
import type { MapCombatInfo } from "@/lib/battle-map-links";
import { refreshCombatInfoAction, setMapCombatAction } from "./map-actions";

export type OpenCombat = {
  id: string;
  name: string | null;
  status: string;
  round: number;
};

const FIELD =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

export function CombatPanel({
  mapId,
  combat,
  openCombats,
  disabled,
  missingCount,
  onCombat,
  onAddTokens,
  onError,
}: {
  mapId: string;
  combat: MapCombatInfo | null;
  openCombats: OpenCombat[];
  disabled: boolean;
  /** Combatants in the attached combat that have no token yet. */
  missingCount: number;
  onCombat: (info: MapCombatInfo | null) => void;
  onAddTokens: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => ReturnType<typeof setMapCombatAction>) => {
    setBusy(true);
    onError(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) onCombat(r.info);
    else onError(r.error);
  };

  const active = combat?.combatants.find(
    (c) => c.id === combat.activeCombatantId,
  );
  const choices =
    !combat || openCombats.some((c) => c.id === combat.id)
      ? openCombats
      : [
          {
            id: combat.id,
            name: combat.name,
            status: combat.status,
            round: combat.round,
          },
          ...openCombats,
        ];

  return (
    <section aria-label="Combat" className="space-y-2">
      <h2 className="font-medium">Combat</h2>
      {choices.length === 0 ? (
        <p className="text-muted">
          No open combats in this campaign. Start one from Encounters or
          Combats, then attach it here.
        </p>
      ) : (
        <select
          aria-label="Attached combat"
          value={combat?.id ?? ""}
          disabled={disabled || busy}
          onChange={(e) =>
            run(() => setMapCombatAction(mapId, e.target.value || null))
          }
          className={FIELD}
        >
          <option value="">No combat attached</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? "Untitled combat"} · {c.status}
            </option>
          ))}
        </select>
      )}
      {combat ? (
        <>
          <p className="text-muted">
            Round {combat.round} · {combat.status}
            {active ? ` · ${active.name}'s turn` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || busy || missingCount === 0}
              onClick={onAddTokens}
              className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
            >
              {missingCount === 0
                ? "All combatants placed"
                : `Add ${missingCount} combatant${missingCount === 1 ? "" : "s"} as tokens`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => refreshCombatInfoAction(mapId))}
              className="rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-muted">
            Allies, enemies and neutrals become green, red and dashed amber
            tokens. Changes made in the combat tracker appear after Refresh.
          </p>
        </>
      ) : null}
    </section>
  );
}
