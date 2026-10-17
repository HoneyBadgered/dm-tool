import { COMBAT_SIDES } from "@/lib/validation/combat";
import type { BuilderEntry } from "@/server/services/combat/encounter-builder";

export const field =
  "mt-0.5 block w-full rounded border border-border bg-white px-2 py-1 text-sm";

type Kind = BuilderEntry["kind"];

/** Shared inputs for adding and editing an entry. */
export function EntryFields({
  kind,
  entry,
  hasBasis,
  defaultLabel,
}: {
  kind: Kind;
  entry?: BuilderEntry;
  /** Stats come from a library creature, so HP and AC overrides are optional. */
  hasBasis: boolean;
  defaultLabel?: string;
}) {
  const overrides = (entry?.overrides ?? {}) as {
    maxHp?: number;
    armorClass?: number;
    notes?: string;
  };
  const needsStats = !hasBasis && kind !== "player_character";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="col-span-2 text-xs">
        Display name{!defaultLabel && " *"}
        <input
          name="label"
          required={!defaultLabel}
          maxLength={80}
          defaultValue={entry?.label}
          placeholder={defaultLabel ?? "Bakery Guard"}
          className={field}
        />
      </label>
      {kind !== "player_character" && (
        <label className="text-xs">
          Copies
          <input
            name="quantity"
            type="number"
            min={1}
            max={50}
            defaultValue={entry?.quantity ?? 1}
            className={field}
          />
        </label>
      )}
      <label className="text-xs">
        Side
        <select name="side" defaultValue={entry?.side ?? ""} className={field}>
          <option value="">Default</option>
          {COMBAT_SIDES.map((side) => (
            <option key={side} value={side}>
              {side}
            </option>
          ))}
        </select>
      </label>
      {hasBasis && kind !== "player_character" && (
        <label className="text-xs">
          HP
          <select
            name="hpMode"
            defaultValue={entry?.hpMode === "rolled" ? "rolled" : "average"}
            className={field}
          >
            <option value="average">Average</option>
            <option value="rolled">Roll each</option>
          </select>
        </label>
      )}
      <label className="text-xs">
        HP{needsStats ? " *" : " override"}
        <input
          name="maxHp"
          type="number"
          min={1}
          required={needsStats}
          defaultValue={overrides.maxHp}
          className={field}
        />
      </label>
      <label className="text-xs">
        AC{needsStats ? " *" : " override"}
        <input
          name="armorClass"
          type="number"
          min={0}
          max={99}
          required={needsStats}
          defaultValue={overrides.armorClass}
          className={field}
        />
      </label>
      <label className="text-xs">
        Wave
        <input
          name="wave"
          type="number"
          min={0}
          max={20}
          defaultValue={entry?.wave ?? 0}
          title="0 starts in combat; 1 or higher is a prepared reinforcement wave"
          className={field}
        />
      </label>
      <label className="flex items-end gap-1 pb-1 text-xs">
        <input
          name="startsHidden"
          type="checkbox"
          defaultChecked={entry?.startsHidden}
        />
        Hidden
      </label>
      <label className="col-span-2 text-xs sm:col-span-4">
        Notes for this encounter
        <input
          name="notes"
          maxLength={2000}
          defaultValue={overrides.notes}
          className={field}
        />
      </label>
      {defaultLabel && (
        <input type="hidden" name="defaultLabel" value={defaultLabel} />
      )}
    </div>
  );
}
