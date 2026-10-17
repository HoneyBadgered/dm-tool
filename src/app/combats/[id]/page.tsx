import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listEncounterEntries } from "@/server/services/combat/encounter-entries";
import {
  getCombat,
  listCombatEvents,
} from "@/server/services/combat/live-combat";
import {
  addReinforcementAction,
  addWaveAction,
  endCombatAction,
  pauseResumeAction,
  startCombatAction,
  turnAction,
} from "../actions";
import { InitiativeList, CombatantPanel } from "./initiative";
import { listConditionDefinitions } from "@/server/services/combat/conditions";
import { ReminderBar } from "./effects";
import { CombatLog, UndoBar, parseDraft } from "./hp";

const NOTICES: Record<string, { text: string; error?: boolean }> = {
  launched: { text: "Combat launched from the encounter." },
  "wave-added": { text: "Reinforcements joined the combat." },
  "reinforcement-added": { text: "Reinforcement added." },
  ended: { text: "Combat ended." },
  started: { text: "Combat started." },
  paused: { text: "Combat paused." },
  resumed: { text: "Combat resumed." },
  turn: { text: "Turn updated." },
  rolled: { text: "Initiative rolled." },
  initiative: { text: "Initiative order updated." },
  defeated: { text: "Marked defeated." },
  returned: { text: "Back in the fight." },
  hidden: { text: "Hidden from the player view." },
  revealed: { text: "Revealed." },
  removed: { text: "Removed from combat." },
  restored: { text: "Restored to combat." },
  damaged: { text: "Damage applied." },
  healed: { text: "Healing applied." },
  "temp-hp": { text: "Temporary HP updated." },
  "hp-set": { text: "Current HP set." },
  "max-hp": { text: "Max HP updated." },
  "effect-added": { text: "Effect applied." },
  "effect-updated": { text: "Effect updated." },
  "effect-removed": { text: "Effect ended." },
  undone: { text: "Last action undone." },
  "nothing-to-undo": { text: "There is nothing to undo.", error: true },
  "undo-conflict": {
    text: "That action can't be undone because later changes depend on it.",
    error: true,
  },
  stale: {
    text: "The combat changed in another tab. The latest state is shown; try again.",
    error: true,
  },
  invalid: {
    text: "That change is not allowed right now (for example, every combatant needs an initiative before starting).",
    error: true,
  },
};

const input =
  "mt-0.5 block w-full rounded border border-border bg-white px-2 py-1 text-sm";

export default function CombatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    notice?: string;
    selected?: string;
    confirm?: string;
    hp?: string;
    amount?: string;
    type?: string;
    adj?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-3xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading combat"
        />
      }
    >
      <CombatDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CombatDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    notice?: string;
    selected?: string;
    confirm?: string;
    hp?: string;
    amount?: string;
    type?: string;
    adj?: string;
  }>;
}) {
  await io();
  const { id } = await params;
  const sp = await searchParams;
  const { notice, selected, confirm } = sp;
  const combat = await getCombat(id);
  if (!combat) notFound();
  const events = await listCombatEvents(id, { limit: 100 });
  const draft = parseDraft(sp);
  const conditions = await listConditionDefinitions();

  const open = combat.status !== "ended";
  const activeName = combat.combatants.find(
    (c) => c.id === combat.activeCombatantId,
  )?.name;
  const unrolled = combat.combatants.filter(
    (c) => c.status === "active" && c.initiative === null,
  ).length;
  const selectedCombatant =
    combat.combatants.find((c) => c.id === selected) ?? null;
  const prepared = new Set<number>();
  if (combat.encounterId) {
    try {
      for (const entry of await listEncounterEntries(combat.encounterId)) {
        if (entry.wave > 0) prepared.add(entry.wave);
      }
    } catch {
      // The template was deleted; there is nothing left to bring in.
    }
  }
  const added = new Set(combat.combatants.map((c) => c.wave));
  const waves = [...prepared]
    .filter((w) => !added.has(w))
    .sort((a, b) => a - b);
  const known = Object.hasOwn(NOTICES, notice ?? "") ? NOTICES[notice!] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={
          combat.encounterId
            ? `/encounters/${combat.encounterId}`
            : "/encounters"
        }
        className="text-sm text-muted hover:underline"
      >
        ← Encounter
      </Link>
      {known && (
        <p
          role={known.error ? "alert" : "status"}
          className={`mt-4 rounded border p-3 text-sm ${known.error ? "border-red-700 bg-red-50 text-red-700" : "border-forest bg-surface text-forest"}`}
        >
          {known.text}
        </p>
      )}
      <h1 className="my-4 text-xl font-semibold">
        {combat.name ?? "Combat"}{" "}
        <span className="text-sm font-normal text-muted">{combat.status}</span>
      </h1>

      <section
        aria-label="Turn tracker"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface p-3"
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Round</p>
          <p className="text-2xl font-semibold">
            {combat.status === "setup" ? "—" : combat.round}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            Current turn
          </p>
          <p className="truncate text-lg font-medium">
            {activeName ??
              (combat.status === "setup" ? "Not started" : "Nobody")}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {combat.status === "setup" ? (
              <>
                <form
                  action={startCombatAction.bind(
                    null,
                    combat.id,
                    combat.version,
                    false,
                  )}
                >
                  <button className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark">
                    Start combat
                  </button>
                </form>
                {unrolled > 0 && (
                  <form
                    action={startCombatAction.bind(
                      null,
                      combat.id,
                      combat.version,
                      true,
                    )}
                  >
                    <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-white">
                      Start without {unrolled} unrolled
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <form
                  action={turnAction.bind(
                    null,
                    combat.id,
                    combat.version,
                    "previous",
                    selected,
                  )}
                >
                  <button
                    disabled={combat.status !== "running"}
                    className="rounded border border-border px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
                  >
                    Previous
                  </button>
                </form>
                <form
                  action={turnAction.bind(
                    null,
                    combat.id,
                    combat.version,
                    "next",
                    selected,
                  )}
                >
                  <button
                    disabled={combat.status !== "running"}
                    className="rounded bg-forest px-4 py-1.5 text-sm text-white hover:bg-forest-dark disabled:opacity-50"
                  >
                    Next turn
                  </button>
                </form>
                <form
                  action={pauseResumeAction.bind(
                    null,
                    combat.id,
                    combat.version,
                    combat.status === "paused" ? "running" : "paused",
                  )}
                >
                  <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-white">
                    {combat.status === "paused" ? "Resume" : "Pause"}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </section>

      <UndoBar
        combat={combat}
        events={events}
        selected={selected}
        conflict={notice === "undo-conflict"}
      />
      <ReminderBar combat={combat} selected={selected} />
      <InitiativeList
        combat={combat}
        selectedId={selected}
        open={open}
        conditions={conditions}
      />
      {selectedCombatant && (
        <CombatantPanel
          draft={draft}
          conditions={conditions}
          combat={combat}
          combatant={selectedCombatant}
          open={open}
        />
      )}

      {open && (
        <section className="mt-6 space-y-4" aria-label="Reinforcements">
          <h2 className="text-lg font-semibold">Reinforcements</h2>
          {waves.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {waves.map((wave) => (
                <form
                  key={wave}
                  action={addWaveAction.bind(
                    null,
                    combat.id,
                    combat.version,
                    wave,
                  )}
                >
                  <button className="rounded border border-forest px-3 py-1.5 text-sm text-forest hover:bg-white">
                    Bring in wave {wave}
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No prepared waves are waiting.</p>
          )}
          <form
            action={addReinforcementAction.bind(
              null,
              combat.id,
              combat.version,
            )}
            className="grid grid-cols-2 gap-2 rounded border border-border bg-surface p-3 sm:grid-cols-5"
          >
            <label className="col-span-2 text-xs">
              Add a one-off creature *
              <input name="name" required maxLength={80} className={input} />
            </label>
            <label className="text-xs">
              HP *
              <input
                name="maxHp"
                type="number"
                min={1}
                required
                className={input}
              />
            </label>
            <label className="text-xs">
              AC *
              <input
                name="armorClass"
                type="number"
                min={0}
                max={99}
                required
                className={input}
              />
            </label>
            <label className="text-xs">
              Side
              <select name="side" defaultValue="enemy" className={input}>
                <option value="enemy">enemy</option>
                <option value="party">party</option>
                <option value="neutral">neutral</option>
              </select>
            </label>
            <button className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark sm:col-span-5 sm:justify-self-start">
              Add reinforcement
            </button>
          </form>
          {confirm === "end" ? (
            <div
              role="alertdialog"
              aria-label="Confirm end combat"
              className="rounded border border-red-700 bg-red-50 p-3 text-sm"
            >
              <p className="mb-2 text-red-700">
                End this combat? It becomes read-only and cannot be resumed. The
                encounter template is not changed.
              </p>
              <div className="flex gap-2">
                <form
                  action={endCombatAction.bind(null, combat.id, combat.version)}
                >
                  <button className="rounded bg-red-700 px-3 py-1.5 text-white hover:bg-red-800">
                    Yes, end combat
                  </button>
                </form>
                <Link
                  href={`/combats/${combat.id}`}
                  className="rounded border border-border bg-white px-3 py-1.5"
                >
                  Keep fighting
                </Link>
              </div>
            </div>
          ) : (
            <Link
              href={`/combats/${combat.id}?confirm=end`}
              className="inline-block rounded border border-red-700 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              End combat…
            </Link>
          )}
        </section>
      )}
      <CombatLog events={events} />
    </div>
  );
}
