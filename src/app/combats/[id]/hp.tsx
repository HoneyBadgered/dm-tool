import Link from "next/link";
import {
  DAMAGE_ADJUSTMENTS,
  type DamageAdjustment,
} from "@/lib/validation/combat";
import {
  adjustDamage,
  applyDamage,
  applyHeal,
  suggestAdjustment,
} from "@/server/services/combat/engine";
import {
  EVENT_FILTERS,
  type CombatEventView,
  type EventFilter,
  type CombatView,
  type CombatantView,
} from "@/server/services/combat/live-combat";
import {
  damageAction,
  healAction,
  setHpAction,
  tempHpAction,
  undoAction,
} from "../actions";

const small =
  "rounded border border-border bg-white px-2 py-0.5 text-xs hover:bg-surface disabled:opacity-40";
const input = "rounded border border-border bg-white px-2 py-1 text-sm";

export type HpDraft = {
  kind: "damage" | "heal";
  amount: number | null;
  type: string;
  adj: string;
} | null;

export function parseDraft(params: {
  hp?: string;
  amount?: string;
  type?: string;
  adj?: string;
}): HpDraft {
  if (params.hp !== "damage" && params.hp !== "heal") return null;
  const n = Number(params.amount);
  return {
    kind: params.hp,
    amount: Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null,
    type: (params.type ?? "").slice(0, 40),
    adj: (DAMAGE_ADJUSTMENTS as readonly string[]).includes(params.adj ?? "")
      ? params.adj!
      : "",
  };
}

export function HpBar({ c }: { c: CombatantView }) {
  const pct = c.maxHp > 0 ? Math.round((c.currentHp / c.maxHp) * 100) : 0;
  const color =
    pct > 50 ? "bg-green-600" : pct > 25 ? "bg-amber-500" : "bg-red-600";
  const tempPct = Math.min(100, Math.round((c.tempHp / c.maxHp) * 100));
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="font-mono text-xs">
        {c.currentHp}/{c.maxHp}
        {c.tempHp > 0 && <span className="text-blue-700"> +{c.tempHp}</span>}
      </span>
      <span
        role="meter"
        aria-label={`${c.name} hit points`}
        aria-valuemin={0}
        aria-valuemax={c.maxHp}
        aria-valuenow={c.currentHp}
        className="block h-1.5 w-24 overflow-hidden rounded bg-gray-200"
      >
        <span
          className={`block h-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      {c.tempHp > 0 && (
        <span className="block h-1 w-24 overflow-hidden rounded bg-gray-100">
          <span
            className="block h-full bg-blue-500"
            style={{ width: `${tempPct}%` }}
          />
        </span>
      )}
    </span>
  );
}

/** Plain GET form: opens the preview in the details panel without changing any state. */
export function QuickHp({
  combatId,
  c,
}: {
  combatId: string;
  c: CombatantView;
}) {
  return (
    <form
      method="get"
      action={`/combats/${combatId}`}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="selected" value={c.id} />
      <input
        name="amount"
        type="number"
        min={1}
        inputMode="numeric"
        aria-label={`Amount for ${c.name}`}
        className="w-16 rounded border border-border bg-white px-1.5 py-0.5 text-xs"
      />
      <button name="hp" value="damage" className={`${small} text-red-700`}>
        Damage
      </button>
      <button name="hp" value="heal" className={`${small} text-green-700`}>
        Heal
      </button>
    </form>
  );
}

function previewHref(
  combatId: string,
  c: CombatantView,
  draft: NonNullable<HpDraft>,
  adj?: string,
) {
  const q = new URLSearchParams({ selected: c.id, hp: draft.kind });
  if (draft.amount !== null) q.set("amount", String(draft.amount));
  if (draft.type) q.set("type", draft.type);
  if (adj) q.set("adj", adj);
  return `/combats/${combatId}?${q}`;
}

export function HpControls({
  combat,
  c,
  draft,
}: {
  combat: CombatView;
  c: CombatantView;
  draft: HpDraft;
}) {
  const v = combat.version;
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <HpBar c={c} />
        <QuickHp combatId={combat.id} c={c} />
      </div>
      {draft?.kind === "damage" && (
        <DamagePreview combat={combat} c={c} draft={draft} />
      )}
      {draft?.kind === "heal" && (
        <HealPreview combat={combat} c={c} draft={draft} />
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">
          Temp HP, set HP, max HP
        </summary>
        <div className="mt-2 space-y-2">
          <form
            action={tempHpAction.bind(null, combat.id, v, c.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs">
              Temp HP
              <input
                name="value"
                type="number"
                min={0}
                className={`${input} mt-0.5 block w-20`}
              />
            </label>
            <label className="text-xs">
              If it already has temp HP
              <select name="mode" className={`${input} mt-0.5 block`}>
                <option value="keep_higher">keep the higher value</option>
                <option value="replace">replace with the new value</option>
              </select>
            </label>
            <button className={small}>Set temp HP</button>
            <button
              name="intent"
              value="clear"
              formNoValidate
              className={small}
            >
              Clear
            </button>
            <p className="basis-full text-xs text-muted">
              Temporary HP do not stack: you choose whether to keep the old
              amount or take the new one.
            </p>
          </form>
          <form
            action={setHpAction.bind(null, combat.id, v, c.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs">
              Set current HP (0 to {c.maxHp})
              <input
                name="value"
                type="number"
                min={0}
                max={c.maxHp}
                defaultValue={c.currentHp}
                required
                className={`${input} mt-0.5 block w-24`}
              />
            </label>
            <label className="text-xs">
              Note
              <input
                name="note"
                maxLength={200}
                className={`${input} mt-0.5 block`}
              />
            </label>
            <button className={small}>Set HP</button>
          </form>
          <form
            action={setHpAction.bind(null, combat.id, v, c.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs">
              Max HP
              <input
                name="maxHp"
                type="number"
                min={1}
                defaultValue={c.maxHp}
                required
                className={`${input} mt-0.5 block w-24`}
              />
            </label>
            <button className={small}>Set max HP</button>
            <p className="basis-full text-xs text-muted">
              Lowering max HP below current HP lowers current HP to match.
            </p>
          </form>
        </div>
      </details>
    </div>
  );
}

function DamagePreview({
  combat,
  c,
  draft,
}: {
  combat: CombatView;
  c: CombatantView;
  draft: NonNullable<HpDraft>;
}) {
  if (draft.amount === null) {
    return <BadAmount combatId={combat.id} c={c} />;
  }
  const suggestion = suggestAdjustment(c.snapshot, draft.type);
  const adj = (draft.adj || suggestion.adjustment) as DamageAdjustment;
  const calculated = adjustDamage(draft.amount, adj);
  const result = applyDamage(c, calculated);
  return (
    <section
      aria-label="Damage preview"
      className="space-y-2 rounded border border-red-700 bg-red-50 p-3 text-sm"
    >
      <h3 className="font-semibold">
        Damage {draft.amount}
        {draft.type && ` ${draft.type}`} to {c.name}
      </h3>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted">Adjustment:</span>
        {DAMAGE_ADJUSTMENTS.map((option) => (
          <Link
            key={option}
            href={previewHref(combat.id, c, draft, option)}
            aria-current={option === adj ? "true" : undefined}
            className={`rounded border px-2 py-0.5 ${option === adj ? "border-forest bg-forest text-white" : "border-border bg-white"}`}
          >
            {option === "none" ? "normal" : option}
          </Link>
        ))}
      </div>
      {suggestion.certain && !draft.adj && (
        <p className="text-xs">
          Suggested from the creature&apos;s data: {suggestion.adjustment}.
        </p>
      )}
      {suggestion.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}
      <ul className="list-disc pl-5">
        <li>
          {draft.amount}
          {adj !== "none" && ` with ${adj} = ${calculated}`}
        </li>
        {result.absorbedByTemp > 0 && (
          <li>{result.absorbedByTemp} absorbed by temporary HP</li>
        )}
        <li>
          HP {c.currentHp} → {result.currentHp} (−{result.appliedToHp})
          {result.tempHp !== c.tempHp &&
            `, temp ${c.tempHp} → ${result.tempHp}`}
        </li>
        {result.overkill > 0 && (
          <li>{result.overkill} excess damage ignored; HP stops at 0.</li>
        )}
        {result.currentHp === 0 && c.currentHp > 0 && (
          <li className="font-medium">
            Reaches 0 HP. Mark it defeated yourself if that applies.
          </li>
        )}
      </ul>
      <form
        action={damageAction.bind(null, combat.id, combat.version, c.id)}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="amount" value={draft.amount} />
        <input type="hidden" name="damageType" value={draft.type} />
        <input type="hidden" name="adjustment" value={adj} />
        <label className="text-xs">
          Override final damage
          <input
            name="override"
            type="number"
            min={0}
            placeholder={String(calculated)}
            className={`${input} mt-0.5 block w-28`}
          />
        </label>
        <label className="text-xs">
          Note
          <input
            name="note"
            maxLength={200}
            className={`${input} mt-0.5 block`}
          />
        </label>
        <button className="rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800">
          Apply {calculated} damage
        </button>
        <Link href={`/combats/${combat.id}?selected=${c.id}`} className={small}>
          Cancel
        </Link>
      </form>
    </section>
  );
}

function HealPreview({
  combat,
  c,
  draft,
}: {
  combat: CombatView;
  c: CombatantView;
  draft: NonNullable<HpDraft>;
}) {
  if (draft.amount === null) {
    return <BadAmount combatId={combat.id} c={c} />;
  }
  const result = applyHeal(c, draft.amount);
  return (
    <section
      aria-label="Healing preview"
      className="space-y-2 rounded border border-green-700 bg-green-50 p-3 text-sm"
    >
      <h3 className="font-semibold">
        Heal {draft.amount} on {c.name}
      </h3>
      <p>
        HP {c.currentHp} → {result.currentHp} (+{result.healed})
        {result.wasted > 0 && `; ${result.wasted} over max HP is not applied`}
      </p>
      <form
        action={healAction.bind(null, combat.id, combat.version, c.id)}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="amount" value={draft.amount} />
        <label className="text-xs">
          Note
          <input
            name="note"
            maxLength={200}
            className={`${input} mt-0.5 block`}
          />
        </label>
        <button className="rounded bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-800">
          Apply {result.healed} healing
        </button>
        <Link href={`/combats/${combat.id}?selected=${c.id}`} className={small}>
          Cancel
        </Link>
      </form>
    </section>
  );
}

function BadAmount({ combatId, c }: { combatId: string; c: CombatantView }) {
  return (
    <p
      role="alert"
      className="rounded border border-red-700 bg-red-50 p-2 text-sm text-red-700"
    >
      Enter a whole number of 1 or more.{" "}
      <Link
        href={`/combats/${combatId}?selected=${c.id}`}
        className="underline"
      >
        Dismiss
      </Link>
    </p>
  );
}

const UNDOABLE = new Set(["undo", "combat_created", "combat_ended"]);

export function UndoBar({
  combat,
  events,
  selected,
  conflict,
}: {
  combat: CombatView;
  events: CombatEventView[];
  selected?: string;
  conflict: boolean;
}) {
  const target = events.find((e) => !e.undone && !UNDOABLE.has(e.type));
  if (combat.status === "ended" || !target) return null;
  return (
    <div className="mb-3 space-y-2">
      <form
        action={undoAction.bind(
          null,
          combat.id,
          combat.version,
          false,
          selected,
        )}
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <button className={small}>Undo last</button>
        <span className="min-w-0 truncate text-muted">{target.summary}</span>
      </form>
      {conflict && (
        <div
          role="alert"
          className="space-y-2 rounded border border-amber-600 bg-amber-50 p-3 text-sm"
        >
          <p>
            That action cannot be undone cleanly because a later change touched
            the same values. Safer fix: open the combatant and use Set HP or
            Heal to correct the number, which is logged as its own entry.
          </p>
          <form
            action={undoAction.bind(
              null,
              combat.id,
              combat.version,
              true,
              selected,
            )}
          >
            <button className={`${small} border-amber-700 text-amber-900`}>
              Force undo anyway (overwrites later values)
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const FILTER_LABELS: Record<EventFilter, string> = {
  all: "All",
  hp: "HP",
  rolls: "Rolls",
  turns: "Turns",
  initiative: "Initiative",
  effects: "Effects",
  combatants: "Combatants",
  notes: "Notes",
  undo: "Undos",
};

const ORIGIN_LABELS = {
  calculated: ["calculated", "border-border text-muted"],
  manual: ["manual", "border-blue-700 text-blue-800"],
  override: ["override", "border-amber-600 bg-amber-50 text-amber-800"],
} as const;

export type LogParams = {
  log?: string;
  logc?: string;
  logn?: string;
};

export function parseLogParams(p: LogParams): {
  filter: EventFilter;
  combatantId?: string;
  limit: number;
} {
  const filter = (EVENT_FILTERS as readonly string[]).includes(p.log ?? "")
    ? (p.log as EventFilter)
    : "all";
  const n = Number(p.logn);
  return {
    filter,
    combatantId: p.logc || undefined,
    limit: Number.isInteger(n) ? Math.min(Math.max(n, 50), 500) : 100,
  };
}

export function CombatLog({
  combat,
  events,
  filter,
  combatantId,
  limit,
  selected,
}: {
  combat: CombatView;
  events: CombatEventView[];
  filter: EventFilter;
  combatantId?: string;
  limit: number;
  selected?: string;
}) {
  const names = new Map(combat.combatants.map((c) => [c.id, c.name]));
  const href = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (selected) q.set("selected", selected);
    const next = {
      log: filter,
      logc: combatantId,
      logn: String(limit),
      ...over,
    };
    if (next.log && next.log !== "all") q.set("log", next.log);
    if (next.logc) q.set("logc", next.logc);
    if (next.logn && next.logn !== "100") q.set("logn", next.logn);
    const text = q.toString();
    return `/combats/${combat.id}${text ? `?${text}` : ""}#log`;
  };
  const filtered = filter !== "all" || !!combatantId;
  return (
    <section id="log" aria-label="Combat log" className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">Log</h2>
      <nav
        aria-label="Filter log"
        className="mb-2 flex flex-wrap gap-1 text-xs"
      >
        {EVENT_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ log: f, logn: undefined })}
            aria-current={f === filter ? "true" : undefined}
            className={`rounded border px-2 py-0.5 ${f === filter ? "border-forest bg-forest text-white" : "border-border bg-white hover:bg-surface"}`}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
        <form
          method="get"
          action={`/combats/${combat.id}`}
          className="ml-auto flex gap-1"
        >
          {selected && <input type="hidden" name="selected" value={selected} />}
          {filter !== "all" && (
            <input type="hidden" name="log" value={filter} />
          )}
          <select
            name="logc"
            defaultValue={combatantId ?? ""}
            aria-label="Filter by combatant"
            className="rounded border border-border bg-white px-1 py-0.5"
          >
            <option value="">Everyone</option>
            {combat.combatants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="rounded border border-border bg-white px-2 py-0.5 hover:bg-surface">
            Apply
          </button>
        </form>
      </nav>
      {events.length === 0 ? (
        <p className="text-sm text-muted">
          {filtered
            ? "No events match this filter."
            : "Nothing has happened yet."}
        </p>
      ) : (
        <ol className="max-h-96 space-y-1 overflow-y-auto rounded border border-border bg-surface p-2 text-sm">
          {events.map((e) => {
            const actor = e.actorCombatantId
              ? names.get(e.actorCombatantId)
              : null;
            const target = e.targetCombatantId
              ? names.get(e.targetCombatantId)
              : null;
            const origin = e.origin ? ORIGIN_LABELS[e.origin] : null;
            return (
              <li
                key={e.seq}
                className={e.undone ? "text-muted line-through" : undefined}
              >
                <span className="mr-2 font-mono text-xs text-muted">
                  #{e.seq} R{e.round}{" "}
                  <time dateTime={e.createdAt.toISOString()}>
                    {e.createdAt.toLocaleTimeString("en-US", { hour12: false })}
                  </time>
                </span>
                {e.summary}
                {origin && (
                  <span
                    className={`ml-1 rounded border px-1 text-xs ${origin[1]}`}
                  >
                    {origin[0]}
                  </span>
                )}
                {e.roll && (
                  <span className="ml-1 text-xs text-muted">
                    [{e.roll.kind}: d20 {e.roll.natural}
                    {e.roll.bonus >= 0 ? "+" : "−"}
                    {Math.abs(e.roll.bonus)} = {e.roll.total} vs{" "}
                    {e.roll.against}
                    {e.roll.manualDice ? ", physical dice" : ""}
                    {e.roll.overrides.length > 0
                      ? `, ${e.roll.overrides.join(", ")}`
                      : ""}
                    ]
                  </span>
                )}
                {(actor || target) && (
                  <span className="ml-1 text-xs text-muted">
                    (
                    {[actor && `by ${actor}`, target && `on ${target}`]
                      .filter(Boolean)
                      .join(" ")}
                    )
                  </span>
                )}
                {e.undone && <span className="ml-1 text-xs">(undone)</span>}
              </li>
            );
          })}
        </ol>
      )}
      {events.length >= limit && limit < 500 && (
        <p className="mt-1 text-xs">
          <Link
            href={href({ logn: String(Math.min(limit + 100, 500)) })}
            className="underline"
          >
            Show older events
          </Link>
        </p>
      )}
    </section>
  );
}
