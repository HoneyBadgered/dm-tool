import type { BuilderEntry } from "@/server/services/combat/encounter-builder";
import { ActionForm } from "./action-form";
import {
  duplicateEntryAction,
  moveEntryAction,
  removeEntryAction,
  updateEntryAction,
} from "./builder-actions";
import { EntryFields } from "./entry-fields";

const KIND_LABEL: Record<BuilderEntry["kind"], string> = {
  monster: "Monster",
  npc: "NPC",
  player_character: "Player",
  custom: "Custom",
};

const iconButton =
  "rounded border border-border px-2 py-1 text-xs hover:bg-white disabled:opacity-40";

export function Lineup({
  encounterId,
  entries,
}: {
  encounterId: string;
  entries: BuilderEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded border border-dashed border-border p-4 text-sm text-muted">
        No combatants yet. Add monsters, NPCs, player characters or custom
        creatures below.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {entries.map((entry, index) => {
        const overrides = (entry.overrides ?? {}) as {
          maxHp?: number;
          armorClass?: number;
          notes?: string;
        };
        const hasBasis =
          entry.kind === "monster" ||
          (entry.kind === "npc" && entry.ruleEntryId !== null);
        return (
          <li
            key={entry.id}
            className="rounded border border-border bg-surface p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-48 grow">
                <span className="font-medium">{entry.label}</span>
                {entry.quantity > 1 && (
                  <span className="text-sm text-muted">
                    {" "}
                    × {entry.quantity}
                  </span>
                )}
                <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-xs text-muted">
                  {KIND_LABEL[entry.kind]}
                </span>
                {entry.wave > 0 && (
                  <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-muted">
                    Reinforcement wave {entry.wave}
                  </span>
                )}
                {entry.startsHidden && (
                  <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs text-muted">
                    Hidden
                  </span>
                )}
                {entry.missing && (
                  <span
                    role="alert"
                    className="ml-1 rounded border border-red-700 px-1.5 py-0.5 text-xs text-red-700"
                  >
                    Record missing
                  </span>
                )}
                <span className="block text-xs text-muted">
                  {[
                    entry.referenceName,
                    overrides.maxHp !== undefined && `HP ${overrides.maxHp}`,
                    overrides.armorClass !== undefined &&
                      `AC ${overrides.armorClass}`,
                    overrides.notes,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex gap-1">
                <form
                  action={moveEntryAction.bind(
                    null,
                    encounterId,
                    entry.id,
                    "up",
                  )}
                >
                  <button
                    className={iconButton}
                    disabled={index === 0}
                    aria-label={`Move ${entry.label} up`}
                  >
                    ↑
                  </button>
                </form>
                <form
                  action={moveEntryAction.bind(
                    null,
                    encounterId,
                    entry.id,
                    "down",
                  )}
                >
                  <button
                    className={iconButton}
                    disabled={index === entries.length - 1}
                    aria-label={`Move ${entry.label} down`}
                  >
                    ↓
                  </button>
                </form>
                {entry.kind !== "player_character" && (
                  <form
                    action={duplicateEntryAction.bind(
                      null,
                      encounterId,
                      entry.id,
                    )}
                  >
                    <button
                      className={iconButton}
                      aria-label={`Duplicate ${entry.label}`}
                    >
                      Duplicate
                    </button>
                  </form>
                )}
                <form
                  action={removeEntryAction.bind(null, encounterId, entry.id)}
                >
                  <button
                    className={`${iconButton} border-red-700 text-red-700`}
                    aria-label={`Remove ${entry.label}`}
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-forest">
                Edit
              </summary>
              <ActionForm
                action={updateEntryAction.bind(
                  null,
                  encounterId,
                  entry.id,
                  entry.kind,
                )}
                submitLabel="Save combatant"
                className="mt-2 space-y-2"
              >
                <EntryFields
                  kind={entry.kind}
                  entry={entry}
                  hasBasis={hasBasis}
                />
              </ActionForm>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
