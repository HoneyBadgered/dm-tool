import Link from "next/link";
import { SAVE_ABILITIES } from "@/lib/validation/combat";
import {
  conciseDescription,
  type ConditionDefinition,
} from "@/server/services/combat/conditions";
import {
  effectReminders,
  type EffectReminder,
} from "@/server/services/combat/engine";
import type {
  CombatView,
  CombatantView,
  EffectView,
} from "@/server/services/combat/live-combat";
import {
  addEffectAction,
  removeEffectAction,
  updateEffectAction,
} from "../actions";

const small =
  "rounded border border-border bg-white px-2 py-0.5 text-xs hover:bg-surface disabled:opacity-40";
const input = "rounded border border-border bg-white px-2 py-1 text-sm";

const TRIGGER_LABEL: Record<string, string> = {
  start_of_target_turn: "start of the target's turn",
  end_of_target_turn: "end of the target's turn",
  start_of_source_turn: "start of the source's turn",
  end_of_source_turn: "end of the source's turn",
};

function nameMap(combat: CombatView) {
  return new Map(combat.combatants.map((c) => [c.id, c.name]));
}

function expiryText(effect: EffectView) {
  if (effect.expiresAtRound === null || effect.expiryTrigger === "none")
    return "Until the DM removes it";
  return `Ends at the ${TRIGGER_LABEL[effect.expiryTrigger]}, round ${effect.expiresAtRound}`;
}

export function reminderList(combat: CombatView): EffectReminder[] {
  if (combat.status === "ended") return [];
  return effectReminders(
    combat.effects.map((e) => ({ ...e, isActive: true })),
    {
      round: combat.status === "setup" ? 0 : combat.round,
      activeCombatantId: combat.activeCombatantId,
      order: combat.turnOrder,
      names: nameMap(combat),
    },
  );
}

/** Compact badges shown beside a combatant's name. */
export function EffectChips({
  effects,
  conditions,
}: {
  effects: EffectView[];
  conditions: Map<string, ConditionDefinition>;
}) {
  if (effects.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" aria-label="Active effects">
      {effects.map((e) => {
        const def = e.conditionIndex ? conditions.get(e.conditionIndex) : null;
        const hint = [
          def ? conciseDescription(def.description, 160) : e.note,
          expiryText(e),
        ]
          .filter(Boolean)
          .join(" — ");
        return (
          <span
            key={e.id}
            title={hint}
            className={`rounded px-1.5 text-xs ${e.kind === "condition" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}
          >
            {e.name}
            {e.concentration && " ◎"}
          </span>
        );
      })}
    </span>
  );
}

/** Due and upcoming reminders; they stay until the DM resolves, extends, or removes the effect. */
export function ReminderBar({
  combat,
  selected,
}: {
  combat: CombatView;
  selected?: string;
}) {
  const reminders = reminderList(combat);
  if (reminders.length === 0) return null;
  const names = nameMap(combat);
  const effectOf = new Map(combat.effects.map((e) => [e.id, e]));
  return (
    <section
      aria-label="Effect reminders"
      className="mb-4 rounded border border-amber-600 bg-amber-50 p-3 text-sm"
    >
      <h2 className="mb-2 font-semibold text-amber-900">Effect reminders</h2>
      <ul className="space-y-2">
        {reminders.map((r) => {
          const effect = effectOf.get(r.effectId);
          return (
            <li
              key={`${r.effectId}-${r.kind}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span
                className={`rounded px-1.5 text-xs ${r.phase === "due" ? "bg-red-700 text-white" : "bg-amber-200"}`}
              >
                {r.phase === "due" ? "Decide now" : "This turn"}
              </span>
              <span className="min-w-0 flex-1">
                <strong>{names.get(r.targetId)}</strong> — {r.text}
              </span>
              {effect && combat.status !== "ended" && (
                <span className="flex gap-1">
                  {r.phase === "due" && r.kind === "expiry" && (
                    <>
                      <form
                        action={removeEffectAction.bind(
                          null,
                          combat.id,
                          combat.version,
                          selected ?? r.targetId,
                          r.effectId,
                          "expired",
                        )}
                      >
                        <button className={small}>It ended</button>
                      </form>
                      <form
                        action={updateEffectAction.bind(
                          null,
                          combat.id,
                          combat.version,
                          selected ?? r.targetId,
                          r.effectId,
                        )}
                      >
                        <input type="hidden" name="extendRounds" value="1" />
                        <button className={small}>Extend 1 round</button>
                      </form>
                    </>
                  )}
                  {r.kind === "save" && (
                    <form
                      action={removeEffectAction.bind(
                        null,
                        combat.id,
                        combat.version,
                        selected ?? r.targetId,
                        r.effectId,
                        "resolved",
                      )}
                    >
                      <button className={small}>Save made — end it</button>
                    </form>
                  )}
                  <Link
                    href={`/combats/${combat.id}?selected=${r.targetId}`}
                    className={small}
                  >
                    Open
                  </Link>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EffectRow({
  combat,
  target,
  effect,
  conditions,
  open,
}: {
  combat: CombatView;
  target: CombatantView;
  effect: EffectView;
  conditions: Map<string, ConditionDefinition>;
  open: boolean;
}) {
  const v = combat.version;
  const def = effect.conditionIndex
    ? conditions.get(effect.conditionIndex)
    : null;
  const names = nameMap(combat);
  const source = effect.sourceCombatantId
    ? (names.get(effect.sourceCombatantId) ?? "a creature no longer listed")
    : null;
  const meta = effect.metadata;
  const update = updateEffectAction.bind(
    null,
    combat.id,
    v,
    target.id,
    effect.id,
  );
  const resolve = removeEffectAction.bind(
    null,
    combat.id,
    v,
    target.id,
    effect.id,
    "resolved",
  );
  const remove = removeEffectAction.bind(
    null,
    combat.id,
    v,
    target.id,
    effect.id,
    "removed",
  );

  return (
    <li className="rounded border border-border bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{effect.name}</strong>
        <span className="text-xs text-muted">
          {effect.kind === "condition" ? "condition" : "ongoing effect"}
          {effect.concentration && " · concentration"}
        </span>
        {def && (
          <Link
            href={`/rules/entry/${def.id}`}
            className="text-xs text-forest underline"
          >
            Rules entry
          </Link>
        )}
      </div>
      {def ? (
        <p className="mt-1 text-xs text-muted">
          {conciseDescription(def.description)}
        </p>
      ) : effect.conditionIndex ? (
        <p className="mt-1 text-xs text-muted">
          The library entry for this condition is no longer available.
        </p>
      ) : null}
      <p className="mt-1 text-xs">
        From {source ?? "no recorded source"} · started round{" "}
        {effect.startedRound} · {expiryText(effect)}
      </p>
      {meta?.save && (
        <p className="text-xs">
          Reminder: DC {meta.save.dc} {meta.save.ability} save at the{" "}
          {meta.save.timing} of the turn (rolled by the DM).
        </p>
      )}
      {meta?.remindAt && (
        <p className="text-xs">
          Reminder at the {meta.remindAt} of the turn
          {meta.damageDice && `: ${meta.damageDice}`}
          {meta.damageType && ` ${meta.damageType}`}
        </p>
      )}
      {effect.note && (
        <p className="mt-1 whitespace-pre-wrap text-xs">{effect.note}</p>
      )}
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {effect.expiresAtRound !== null && (
            <form action={update}>
              <input type="hidden" name="extendRounds" value="1" />
              <button className={small}>Extend 1 round</button>
            </form>
          )}
          <form action={resolve}>
            <button className={small}>Resolve</button>
          </form>
          <form action={remove}>
            <button className={small}>Remove</button>
          </form>
        </div>
      )}
      {open && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-forest">Edit</summary>
          <form
            action={update}
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <input type="hidden" name="edit" value="1" />
            <label className="col-span-2 text-xs sm:col-span-4">
              Notes
              <textarea
                name="note"
                defaultValue={effect.note ?? ""}
                maxLength={2000}
                rows={2}
                className={`${input} block w-full`}
              />
            </label>
            <label className="text-xs">
              Ends in round
              <input
                name="expiresAtRound"
                type="number"
                min={1}
                defaultValue={effect.expiresAtRound ?? ""}
                className={`${input} block w-full`}
              />
            </label>
            <label className="col-span-2 text-xs">
              Ends at
              <select
                name="expiryTrigger"
                defaultValue={
                  effect.expiryTrigger === "none"
                    ? "end_of_target_turn"
                    : effect.expiryTrigger
                }
                className={`${input} block w-full`}
              >
                {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-1 text-xs">
              <input
                type="checkbox"
                name="concentration"
                defaultChecked={effect.concentration}
              />
              Concentration
            </label>
            <SaveFields meta={meta} />
            <p className="col-span-2 text-xs text-muted sm:col-span-4">
              Leave &ldquo;Ends in round&rdquo; empty for an effect that lasts
              until you remove it.
            </p>
            <button className="rounded bg-forest px-3 py-1 text-xs text-white hover:bg-forest-dark">
              Save changes
            </button>
          </form>
        </details>
      )}
    </li>
  );
}

function SaveFields({ meta }: { meta: EffectView["metadata"] }) {
  return (
    <>
      <label className="text-xs">
        Save
        <select
          name="saveAbility"
          defaultValue={meta?.save?.ability ?? ""}
          className={`${input} block w-full`}
        >
          <option value="">none</option>
          {SAVE_ABILITIES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        DC
        <input
          name="saveDc"
          type="number"
          min={1}
          max={40}
          defaultValue={meta?.save?.dc ?? ""}
          className={`${input} block w-full`}
        />
      </label>
      <label className="text-xs">
        Save at
        <select
          name="saveTiming"
          defaultValue={meta?.save?.timing ?? "end"}
          className={`${input} block w-full`}
        >
          <option value="start">start of turn</option>
          <option value="end">end of turn</option>
        </select>
      </label>
      <label className="text-xs">
        Remind (ongoing)
        <select
          name="remindAt"
          defaultValue={meta?.remindAt ?? ""}
          className={`${input} block w-full`}
        >
          <option value="">no</option>
          <option value="start">start of turn</option>
          <option value="end">end of turn</option>
        </select>
      </label>
      <label className="text-xs">
        Dice
        <input
          name="damageDice"
          maxLength={40}
          defaultValue={meta?.damageDice ?? ""}
          placeholder="1d6"
          className={`${input} block w-full`}
        />
      </label>
      <label className="text-xs">
        Type
        <input
          name="damageType"
          maxLength={40}
          defaultValue={meta?.damageType ?? ""}
          className={`${input} block w-full`}
        />
      </label>
    </>
  );
}

export function EffectsPanel({
  combat,
  combatant,
  conditions,
  open,
}: {
  combat: CombatView;
  combatant: CombatantView;
  conditions: ConditionDefinition[];
  open: boolean;
}) {
  const byIndex = new Map(conditions.map((c) => [c.index, c]));
  const effects = combat.effects.filter((e) => e.targetId === combatant.id);
  const sources = combat.combatants.filter((c) => c.status !== "removed");
  const addable = open && combatant.status !== "removed";
  const immune = new Set(
    (combatant.snapshot?.conditionImmunities ?? []).map((s) => s.toLowerCase()),
  );
  const addAction = addEffectAction.bind(
    null,
    combat.id,
    combat.version,
    combatant.id,
  );

  return (
    <section
      aria-label={`${combatant.name} conditions and effects`}
      className="mt-4 border-t border-border pt-3"
    >
      <h3 className="mb-2 font-semibold">Conditions and effects</h3>
      {effects.length === 0 ? (
        <p className="text-xs text-muted">No active effects.</p>
      ) : (
        <ul className="space-y-2">
          {effects.map((e) => (
            <EffectRow
              key={e.id}
              combat={combat}
              target={combatant}
              effect={e}
              conditions={byIndex}
              open={open}
            />
          ))}
        </ul>
      )}
      {immune.size > 0 && (
        <p className="mt-2 text-xs text-muted">
          Listed condition immunities: {[...immune].join(", ")}. The app only
          warns; you decide.
        </p>
      )}
      {addable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-forest">
            Add condition or effect
          </summary>
          <form
            action={addAction}
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <label className="col-span-2 text-xs">
              Library condition
              <select
                name="conditionIndex"
                defaultValue=""
                className={`${input} block w-full`}
              >
                <option value="">Custom effect…</option>
                {conditions.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs">
              Custom name (when no condition is chosen)
              <input
                name="name"
                maxLength={80}
                className={`${input} block w-full`}
              />
            </label>
            <label className="text-xs">
              Type (custom)
              <select
                name="kind"
                defaultValue="condition"
                className={`${input} block w-full`}
              >
                <option value="condition">condition</option>
                <option value="ongoing">ongoing effect</option>
              </select>
            </label>
            <label className="col-span-2 text-xs">
              Applied by
              <select
                name="sourceCombatantId"
                defaultValue=""
                className={`${input} block w-full`}
              >
                <option value="">Unknown / environment</option>
                {sources.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-1 text-xs">
              <input type="checkbox" name="concentration" />
              Concentration
            </label>
            <label className="text-xs">
              Lasts (rounds)
              <input
                name="durationRounds"
                type="number"
                min={1}
                max={1000}
                className={`${input} block w-full`}
              />
            </label>
            <label className="col-span-2 text-xs">
              Ends at
              <select
                name="expiryTrigger"
                defaultValue="end_of_target_turn"
                className={`${input} block w-full`}
              >
                {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <SaveFields meta={null} />
            <label className="col-span-2 text-xs sm:col-span-4">
              Notes
              <textarea
                name="note"
                maxLength={2000}
                rows={2}
                className={`${input} block w-full`}
              />
            </label>
            <p className="col-span-2 text-xs text-muted sm:col-span-4">
              The library does not define durations; leave &ldquo;Lasts&rdquo;
              empty for an effect you will end yourself. Saves and ongoing
              damage only create reminders.
            </p>
            <button className="rounded bg-forest px-3 py-1 text-sm text-white hover:bg-forest-dark">
              Apply
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
