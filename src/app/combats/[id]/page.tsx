import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import { listCharacters } from "@/server/services/campaigns/characters";
import { listEncounterEntries } from "@/server/services/combat/encounter-entries";
import {
  getCombat,
  listCombatEvents,
} from "@/server/services/combat/live-combat";
import {
  addPlayerCharacterAction,
  addReinforcementAction,
  addWaveAction,
  endCombatAction,
  pauseResumeAction,
  startCombatAction,
  turnAction,
} from "../actions";
import { InitiativeList, CombatantPanel } from "./initiative";
import {
  listConditionDefinitions,
  listSpellLinks,
} from "@/server/services/combat/conditions";
import { ReminderBar } from "./effects";
import { CombatLog, UndoBar, parseDraft, parseLogParams } from "./hp";
import { FormGuard } from "./form-guard";
import { Shortcuts } from "./shortcuts";

const NOTICES: Record<string, { text: string; error?: boolean }> = {
  launched: { text: "Combat launched from the encounter." },
  "wave-added": { text: "Reinforcements joined the combat." },
  "reinforcement-added": { text: "Reinforcement added." },
  "player-added": { text: "Player character added to the combat." },
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
  resolved: { text: "Roll confirmed and recorded." },
  "notes-saved": { text: "Notes saved." },
  "bad-roll": {
    text: "That roll could not be made. Check the dice, DC, target and bonus; missing bonuses are never guessed.",
    error: true,
  },
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
    text: "The combat has already changed (another tab, or a repeated click or retry that was applied). The latest saved state is shown; check the log before trying again.",
    error: true,
  },
  invalid: {
    text: "That change is not allowed right now (for example, every combatant needs an initiative before starting).",
    error: true,
  },
};

const input =
  "mt-0.5 block w-full rounded border border-border bg-input px-2 py-1 text-sm";

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
    res?: string;
    hit?: string;
    crit?: string;
    success?: string;
    final?: string;
    radj?: string | string[];
    log?: string;
    logc?: string;
    logn?: string;
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
    res?: string;
    hit?: string;
    crit?: string;
    success?: string;
    final?: string;
    radj?: string | string[];
    log?: string;
    logc?: string;
    logn?: string;
  }>;
}) {
  await io();
  const { id: param } = await params;
  const sp = await searchParams;
  const { notice, selected, confirm } = sp;
  const combat = await getCombat(await resolveSlugParam("combat", param));
  if (!combat) notFound();
  const id = combat.id;
  await redirectToSlugUrl({
    kind: "combat",
    param,
    entity: { id, name: combat.name ?? "combat" },
    path: (slug) => `/combats/${slug}`,
    search: sp,
  });
  const logView = parseLogParams(sp);
  const events = await listCombatEvents(id, { limit: 100 });
  const logEvents = await listCombatEvents(id, logView);
  const draft = parseDraft(sp);
  const conditions = await listConditionDefinitions();
  const spells = selected ? await listSpellLinks() : [];

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
  const inCombat = new Set(
    combat.combatants.flatMap((c) =>
      c.sourcePlayerCharacterId ? [c.sourcePlayerCharacterId] : [],
    ),
  );
  const availablePlayers = open
    ? (await listCharacters(combat.campaignId)).filter(
        (pc) => !inCombat.has(pc.id),
      )
    : [];
  const added = new Set(combat.combatants.map((c) => c.wave));
  const waves = [...prepared]
    .filter((w) => !added.has(w))
    .sort((a, b) => a - b);
  const known = Object.hasOwn(NOTICES, notice ?? "") ? NOTICES[notice!] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <FormGuard />
      <Shortcuts />
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
          className={`mt-4 rounded border p-3 text-sm ${known.error ? "border-danger bg-danger/15 text-danger" : "border-primary bg-surface text-link"}`}
        >
          {known.text}
        </p>
      )}
      <h1 className="my-4 text-xl font-semibold">
        {combat.name ?? "Combat"}{" "}
        <span className="text-sm font-normal text-muted">{combat.status}</span>
      </h1>
      <p className="-mt-3 mb-4 text-xs text-muted">
        {combat.status === "ended" ? (
          <>
            Ended {combat.endedAt?.toLocaleString("en-US", { hour12: false })}.
            This history is preserved and read-only.
          </>
        ) : (
          <>
            Saved on the server · version {combat.version} · last change{" "}
            {combat.updatedAt.toLocaleString("en-US", { hour12: false })}.
            Refreshing or restarting resumes exactly here.
          </>
        )}
      </p>

      <section
        aria-label="Turn tracker"
        className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface p-3"
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
                  <button className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover">
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
                    <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input">
                      Start without {unrolled} unrolled
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <form
                  id="turn-previous"
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
                    className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input disabled:opacity-50"
                  >
                    Previous
                  </button>
                </form>
                <form
                  id="turn-next"
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
                    className="rounded bg-primary px-4 py-1.5 text-sm text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    Next turn
                    <kbd className="ml-1.5 hidden rounded bg-input/20 px-1 text-xs sm:inline">
                      N
                    </kbd>
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
                  <button className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input">
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
          spells={spells}
          resolveParams={sp}
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
                  <button className="rounded border border-primary px-3 py-1.5 text-sm text-link hover:bg-input">
                    Bring in wave {wave}
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No prepared waves are waiting.</p>
          )}
          <form
            action={addPlayerCharacterAction.bind(
              null,
              combat.id,
              combat.version,
            )}
            className="grid grid-cols-2 gap-2 rounded border border-border bg-surface p-3 sm:grid-cols-5"
          >
            {availablePlayers.length === 0 ? (
              <p className="col-span-full text-sm text-muted">
                Every player character in this campaign is already in the
                combat.{" "}
                <Link
                  href={`/campaigns/${combat.campaignId}`}
                  className="underline"
                >
                  Manage characters
                </Link>
              </p>
            ) : (
              <>
                <label className="col-span-2 text-xs sm:col-span-3">
                  Add a player character
                  <select name="playerCharacterId" required className={input}>
                    {availablePlayers.map((pc) => (
                      <option key={pc.id} value={pc.id}>
                        {pc.name}
                        {pc.playerName ? ` (${pc.playerName})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Initiative
                  <input
                    name="initiative"
                    type="number"
                    min={-20}
                    max={60}
                    placeholder="later"
                    className={input}
                  />
                </label>
                <button className="self-end rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover">
                  Add player
                </button>
              </>
            )}
          </form>
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
            <button className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover sm:col-span-5 sm:justify-self-start">
              Add reinforcement
            </button>
          </form>
          {confirm === "end" ? (
            <div
              role="alertdialog"
              aria-label="Confirm end combat"
              className="rounded border border-danger bg-danger/15 p-3 text-sm"
            >
              <p className="mb-2 text-danger">
                End this combat? It becomes read-only and cannot be resumed. The
                encounter template is not changed.
              </p>
              <div className="flex gap-2">
                <form
                  action={endCombatAction.bind(null, combat.id, combat.version)}
                >
                  <button className="rounded bg-danger-strong px-3 py-1.5 text-on-primary hover:bg-danger-strong/85">
                    Yes, end combat
                  </button>
                </form>
                <Link
                  href={`/combats/${combat.id}`}
                  className="rounded border border-border bg-input px-3 py-1.5"
                >
                  Keep fighting
                </Link>
              </div>
            </div>
          ) : (
            <Link
              href={`/combats/${combat.id}?confirm=end`}
              className="inline-block rounded border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/15"
            >
              End combat…
            </Link>
          )}
        </section>
      )}
      <CombatLog
        combat={combat}
        events={logEvents}
        filter={logView.filter}
        combatantId={logView.combatantId}
        limit={logView.limit}
        selected={selected}
      />
    </div>
  );
}
