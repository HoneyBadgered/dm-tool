import Link from "next/link";
import { orderCombatants } from "@/server/services/combat/engine";
import type {
  CombatView,
  CombatantView,
} from "@/server/services/combat/live-combat";
import type { ConditionDefinition } from "@/server/services/combat/conditions";
import { EffectChips, EffectsPanel } from "./effects";
import { NotesForm, StatBlock } from "./statblock";
import { ResolvePanel, type ResolveParams } from "./resolve";
import type { RuleLink } from "@/server/services/combat/conditions";
import { HpBar, HpControls, QuickHp, type HpDraft } from "./hp";
import {
  defeatAction,
  moveInitiativeAction,
  removeCombatantAction,
  restoreCombatantAction,
  rollInitiativeAction,
  selectTurnAction,
  setInitiativeAction,
  visibilityAction,
} from "../actions";

const small =
  "rounded border border-border bg-input px-2 py-0.5 text-xs hover:bg-surface disabled:opacity-40";
const field = "w-20 rounded border border-border bg-input px-2 py-1 text-sm";

export function InitiativeList({
  combat,
  selectedId,
  open,
  conditions,
}: {
  combat: CombatView;
  selectedId?: string;
  open: boolean;
  conditions: ConditionDefinition[];
}) {
  const byIndex = new Map(conditions.map((c) => [c.index, c]));
  const ordered = orderCombatants(combat.combatants);
  const inOrder = ordered.filter((c) => c.status !== "removed");
  const removed = ordered.filter((c) => c.status === "removed");
  const tied = new Map<number, number>();
  for (const c of inOrder) {
    if (c.initiative !== null) {
      tied.set(c.initiative, (tied.get(c.initiative) ?? 0) + 1);
    }
  }
  const unrolled = inOrder.filter(
    (c) => c.status === "active" && c.initiative === null,
  );
  const running = combat.status === "running";

  return (
    <section aria-label="Initiative order">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Initiative</h2>
        {open && unrolled.length > 0 && (
          <form
            action={rollInitiativeAction.bind(
              null,
              combat.id,
              combat.version,
              unrolled.map((c) => c.id),
              false,
              selectedId,
            )}
          >
            <button className={small}>
              Roll initiative for {unrolled.length} unrolled
            </button>
          </form>
        )}
      </div>
      {inOrder.length === 0 ? (
        <p className="rounded border border-border bg-surface p-3 text-sm text-muted">
          No combatants in this combat.
        </p>
      ) : (
        <ol className="space-y-1">
          {inOrder.map((c, index) => {
            const isActive = c.id === combat.activeCombatantId && running;
            const isTied =
              c.initiative !== null && (tied.get(c.initiative) ?? 0) > 1;
            const sameBefore =
              isTied && inOrder[index - 1]?.initiative === c.initiative;
            const sameAfter =
              isTied && inOrder[index + 1]?.initiative === c.initiative;
            return (
              <li
                key={c.id}
                aria-current={isActive ? "true" : undefined}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm ${
                  isActive
                    ? "border-primary bg-success/15 ring-2 ring-highlight"
                    : c.id === selectedId
                      ? "border-primary bg-input"
                      : "border-border bg-surface"
                } ${c.status === "defeated" ? "opacity-60" : ""}`}
              >
                <span
                  className="w-4 text-link"
                  aria-label={isActive ? "Active turn" : undefined}
                >
                  {isActive ? "▶" : ""}
                </span>
                <span
                  className="w-10 text-right font-mono text-base"
                  title="Initiative"
                >
                  {c.initiative ?? "–"}
                </span>
                <Link
                  href={`/combats/${combat.id}?selected=${c.id}`}
                  className={`min-w-0 flex-1 truncate font-medium hover:underline ${c.status === "defeated" ? "line-through" : ""}`}
                >
                  {c.name}
                </Link>
                <EffectChips
                  effects={combat.effects.filter((e) => e.targetId === c.id)}
                  conditions={byIndex}
                />
                <span className="text-xs text-muted">
                  {c.side}
                  {c.status === "defeated" && " · defeated"}
                  {c.wave > 0 && ` · wave ${c.wave}`}
                  {isTied && " · tied"}
                </span>
                {c.isHidden && (
                  <span
                    className="rounded bg-border px-1.5 text-xs"
                    title="Hidden from the player view"
                  >
                    🙈 hidden
                  </span>
                )}
                <span className="flex items-center gap-2 text-muted">
                  <HpBar c={c} />
                  <span>AC {c.armorClass}</span>
                </span>
                {open && c.status !== "removed" && (
                  <QuickHp combatId={combat.id} c={c} />
                )}
                {open && isTied && (
                  <span className="flex gap-1">
                    <form
                      action={moveInitiativeAction.bind(
                        null,
                        combat.id,
                        combat.version,
                        c.id,
                        "up",
                      )}
                    >
                      <button
                        className={small}
                        disabled={!sameBefore}
                        aria-label={`Move ${c.name} up among ties`}
                      >
                        ▲
                      </button>
                    </form>
                    <form
                      action={moveInitiativeAction.bind(
                        null,
                        combat.id,
                        combat.version,
                        c.id,
                        "down",
                      )}
                    >
                      <button
                        className={small}
                        disabled={!sameAfter}
                        aria-label={`Move ${c.name} down among ties`}
                      >
                        ▼
                      </button>
                    </form>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {removed.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">
            Removed ({removed.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {removed.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-border bg-surface px-3 py-1"
              >
                <span>{c.name}</span>
                {open && (
                  <form
                    action={restoreCombatantAction.bind(
                      null,
                      combat.id,
                      combat.version,
                      c.id,
                    )}
                  >
                    <button className={small}>Restore</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function CombatantPanel({
  combat,
  combatant: c,
  open,
  draft,
  conditions,
  spells,
  resolveParams,
}: {
  combat: CombatView;
  combatant: CombatantView;
  open: boolean;
  draft: HpDraft;
  conditions: ConditionDefinition[];
  spells: RuleLink[];
  resolveParams: ResolveParams;
}) {
  const v = combat.version;
  const hasTurn = c.id === combat.activeCombatantId;
  const modifier = c.snapshot?.initiativeModifier;
  return (
    <section
      aria-label={`${c.name} details`}
      className="mt-4 rounded border border-border bg-surface p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        <Link
          href={`/combats/${combat.id}`}
          className="text-xs text-muted hover:underline"
        >
          Close
        </Link>
      </div>
      <p className="text-muted">
        {c.kind} · {c.side} · {c.status}
        {c.isHidden && " · hidden"} · HP {c.currentHp}/{c.maxHp}
        {c.tempHp > 0 && ` (+${c.tempHp} temp)`} · AC {c.armorClass}
        {modifier !== undefined &&
          ` · initiative modifier ${modifier >= 0 ? "+" : ""}${modifier}`}
      </p>
      {c.notes && <p className="mt-1 whitespace-pre-wrap">{c.notes}</p>}
      <StatBlock combatant={c} conditions={conditions} spells={spells} />
      <ResolvePanel
        combat={combat}
        actor={c}
        params={resolveParams}
        open={open}
      />

      {open && c.status !== "removed" && (
        <HpControls combat={combat} c={c} draft={draft} />
      )}
      <EffectsPanel
        combat={combat}
        combatant={c}
        conditions={conditions}
        open={open}
      />
      {open && c.status !== "removed" && (
        <NotesForm combat={combat} combatant={c} />
      )}
      {open && c.status !== "removed" && (
        <div className="mt-3 space-y-3">
          <form
            action={setInitiativeAction.bind(null, combat.id, v, c.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-xs">
              Initiative
              <input
                name="initiative"
                type="number"
                min={-20}
                max={60}
                defaultValue={c.initiative ?? ""}
                className={`${field} mt-0.5 block`}
              />
            </label>
            <label className="text-xs">
              Tie-break (lower goes first)
              <input
                name="tieBreak"
                type="number"
                min={-1000}
                max={1000}
                defaultValue={c.initiativeTieBreak}
                className={`${field} mt-0.5 block`}
              />
            </label>
            <button className={small}>Save initiative</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <form
              action={rollInitiativeAction.bind(
                null,
                combat.id,
                v,
                [c.id],
                true,
                c.id,
              )}
            >
              <button className={small}>
                {c.initiative === null
                  ? "Roll initiative"
                  : "Re-roll initiative"}
              </button>
            </form>
            {combat.status === "running" && c.status === "active" && (
              <form action={selectTurnAction.bind(null, combat.id, v, c.id)}>
                <button className={small} disabled={hasTurn}>
                  {hasTurn ? "Has the turn" : "Give turn to this combatant"}
                </button>
              </form>
            )}
            <form
              action={defeatAction.bind(
                null,
                combat.id,
                v,
                c.id,
                c.status === "active",
              )}
            >
              <button className={small}>
                {c.status === "active" ? "Mark defeated" : "Return to combat"}
              </button>
            </form>
            <form
              action={visibilityAction.bind(
                null,
                combat.id,
                v,
                c.id,
                !c.isHidden,
              )}
            >
              <button className={small}>
                {c.isHidden ? "Reveal" : "Hide"}
              </button>
            </form>
            <form action={removeCombatantAction.bind(null, combat.id, v, c.id)}>
              <button className={`${small} text-danger`}>
                Remove from combat
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
