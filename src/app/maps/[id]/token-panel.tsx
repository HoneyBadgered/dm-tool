"use client";

import Link from "next/link";
import { useState } from "react";
import {
  dispositionForRecord,
  dispositionForSide,
  type LinkTarget,
  type MapCombatInfo,
  type RecordInfo,
  type TokenStats,
} from "@/lib/battle-map-links";
import {
  TOKEN_DISPOSITIONS,
  type MapToken,
  type TokenDisposition,
  type TokenLink,
} from "@/lib/validation/battle-map";
import {
  lookupLinkAction,
  searchLinkTargetsAction,
  type CombatCommand,
} from "./map-actions";

const FIELD =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";
const BTN =
  "rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-foreground/10 disabled:opacity-40";

const DISPOSITION_LABEL: Record<TokenDisposition, string> = {
  ally: "Ally (green)",
  hostile: "Hostile (red)",
  neutral: "Neutral (dashed amber)",
};

type RecordKind = Exclude<TokenLink["kind"], "combatant">;
type LinkKindChoice = "none" | TokenLink["kind"];

export function TokenPanel({
  mapId,
  token,
  stats,
  combat,
  disabled,
  showRange,
  rangeSpeed,
  busy,
  onPatch,
  onRecord,
  onToggleRange,
  onCommand,
}: {
  mapId: string;
  token: MapToken;
  stats: TokenStats | null;
  combat: MapCombatInfo | null;
  disabled: boolean;
  showRange: boolean;
  rangeSpeed: number | null;
  busy: boolean;
  onPatch: (patch: Partial<Omit<MapToken, "id">>) => void;
  onRecord: (record: RecordInfo) => void;
  onToggleRange: (on: boolean) => void;
  onCommand: (command: CombatCommand) => void;
}) {
  const [kind, setKind] = useState<LinkKindChoice>(token.link?.kind ?? "none");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [amount, setAmount] = useState("");

  const search = async (k: RecordKind, q: string) => {
    setSearching(true);
    setResults(await searchLinkTargetsAction(mapId, k, q));
    setSearching(false);
  };

  const link = async (
    next: TokenLink,
    name: string,
    disposition: TokenDisposition,
  ) => {
    const patch: Partial<Omit<MapToken, "id">> = { link: next };
    if (!token.label.trim()) patch.label = name.slice(0, 40);
    if (token.disposition === "neutral") patch.disposition = disposition;
    onPatch(patch);
    setResults([]);
    setQuery("");
    if (next.kind !== "combatant") {
      const record = await lookupLinkAction(mapId, next);
      if (record) onRecord(record);
    }
  };

  const amountValue = /^\d+$/.test(amount) ? Number(amount) : null;
  const combatant = stats?.combatantId ?? null;
  const canDose = !busy && amountValue !== null && amountValue >= 1;

  return (
    <section aria-label="Selected token details" className="space-y-2">
      <h2 className="font-medium">Role &amp; link</h2>
      <label className="block">
        <span className="text-muted">Side</span>
        <select
          aria-label="Token disposition"
          value={token.disposition}
          disabled={disabled}
          onChange={(e) =>
            onPatch({ disposition: e.target.value as TokenDisposition })
          }
          className={FIELD}
        >
          {TOKEN_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {DISPOSITION_LABEL[d]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-muted">Linked to</span>
        <select
          aria-label="Link type"
          value={kind}
          disabled={disabled}
          onChange={(e) => {
            const k = e.target.value as LinkKindChoice;
            setKind(k);
            setResults([]);
            setQuery("");
            if (k === "none") onPatch({ link: null });
            else if (k !== "combatant") void search(k, "");
          }}
          className={FIELD}
        >
          <option value="none">Nothing</option>
          <option value="combatant" disabled={!combat}>
            Combatant{combat ? "" : " (attach a combat first)"}
          </option>
          <option value="player_character">Player character</option>
          <option value="npc">NPC</option>
          <option value="monster">Monster (stat reference)</option>
        </select>
      </label>

      {kind === "combatant" && combat ? (
        <select
          aria-label="Linked combatant"
          disabled={disabled}
          value={token.link?.kind === "combatant" ? token.link.id : ""}
          onChange={(e) => {
            const c = combat.combatants.find((x) => x.id === e.target.value);
            if (c)
              void link(
                { kind: "combatant", id: c.id },
                c.name,
                dispositionForSide(c.side),
              );
          }}
          className={FIELD}
        >
          <option value="">Choose a combatant…</option>
          {combat.combatants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}

      {kind !== "none" && kind !== "combatant" ? (
        <div className="space-y-1">
          <input
            aria-label="Search records to link"
            value={query}
            placeholder={
              kind === "monster"
                ? "Search monsters (2+ letters)"
                : "Search by name"
            }
            onChange={(e) => {
              setQuery(e.target.value);
              void search(kind, e.target.value);
            }}
            className={FIELD}
          />
          {searching ? <p className="text-xs text-muted">Searching…</p> : null}
          {results.length ? (
            <ul className="max-h-36 overflow-y-auto rounded border border-border">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void link(
                        { kind, id: r.id },
                        r.name,
                        dispositionForRecord(kind),
                      )
                    }
                    className="block w-full px-2 py-1 text-left hover:bg-foreground/10"
                  >
                    {r.name}
                    {r.detail ? (
                      <span className="text-xs text-muted"> · {r.detail}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {token.link ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onPatch({ link: null });
            setKind("none");
          }}
          className={BTN}
        >
          Clear link
        </button>
      ) : null}

      {token.link && !stats ? (
        <p className="text-xs text-muted">
          Details are not available. The linked record may have been removed, or
          its combat is not attached.
        </p>
      ) : null}

      {stats ? (
        <div className="space-y-1 rounded border border-border bg-background p-2">
          <p className="font-medium">
            {stats.name}
            {stats.isActive ? (
              <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-xs text-on-primary">
                Active turn
              </span>
            ) : null}
            {stats.defeated ? (
              <span className="ml-1 text-xs text-danger">Defeated</span>
            ) : null}
          </p>
          {stats.detail ? (
            <p className="text-xs text-muted">{stats.detail}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <dt className="text-muted">AC</dt>
            <dd>{stats.ac ?? "—"}</dd>
            <dt className="text-muted">HP</dt>
            <dd>
              {stats.hp === null
                ? "—"
                : stats.source === "combatant"
                  ? `${stats.hp} / ${stats.maxHp}${stats.tempHp ? ` (+${stats.tempHp} temp)` : ""}`
                  : `${stats.maxHp} max`}
            </dd>
            <dt className="text-muted">Speed</dt>
            <dd>{stats.speed !== null ? `${stats.speed} ft.` : "—"}</dd>
            {stats.initiative !== null ? (
              <>
                <dt className="text-muted">Initiative</dt>
                <dd>{stats.initiative}</dd>
              </>
            ) : null}
          </dl>
          {stats.effects.length ? (
            <p>
              <span className="text-muted">Conditions: </span>
              {stats.effects.join(", ")}
            </p>
          ) : stats.source === "combatant" ? (
            <p className="text-muted">No active conditions</p>
          ) : null}
          {stats.href ? (
            <Link
              href={stats.href}
              className="text-link underline"
              target="_blank"
            >
              {stats.source === "combatant"
                ? "Open combat tracker"
                : "Open record"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {combatant && combat ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              aria-label="Damage or healing amount"
              inputMode="numeric"
              value={amount}
              placeholder="Amount"
              onChange={(e) => setAmount(e.target.value)}
              className={`${FIELD} w-20`}
            />
            <button
              type="button"
              disabled={!canDose}
              onClick={() =>
                amountValue &&
                onCommand({
                  type: "damage",
                  combatantId: combatant,
                  amount: amountValue,
                })
              }
              className={BTN}
            >
              Damage
            </button>
            <button
              type="button"
              disabled={!canDose}
              onClick={() =>
                amountValue &&
                onCommand({
                  type: "heal",
                  combatantId: combatant,
                  amount: amountValue,
                })
              }
              className={BTN}
            >
              Heal
            </button>
          </div>
          {stats?.isActive ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCommand({ type: "nextTurn" })}
              className="rounded-md bg-primary px-2.5 py-1 text-on-primary disabled:opacity-40"
            >
              End turn
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onCommand({ type: "makeActive", combatantId: combatant })
              }
              className={BTN}
            >
              Make active turn
            </button>
          )}
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="block">
          <span className="text-muted">Movement speed (ft.)</span>
          <input
            key={`${token.id}:${token.speed}`}
            aria-label="Token movement speed"
            inputMode="numeric"
            defaultValue={token.speed ?? ""}
            disabled={disabled}
            placeholder={
              stats?.speed ? `${stats.speed} (from record)` : "Not set"
            }
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === "") {
                if (token.speed !== null) onPatch({ speed: null });
              } else if (/^\d+$/.test(v) && Number(v) <= 500) {
                if (Number(v) !== token.speed) onPatch({ speed: Number(v) });
              }
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
            checked={showRange}
            onChange={(e) => onToggleRange(e.target.checked)}
          />
          Show movement range
        </label>
        {showRange ? (
          <p className="text-xs text-muted">
            {rangeSpeed === null
              ? "Set a speed above to see how far this token can move."
              : `Blue squares are reachable with ${rangeSpeed} ft. Difficult terrain costs double; walls, closed doors and obstacles block. Other tokens do not block.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
