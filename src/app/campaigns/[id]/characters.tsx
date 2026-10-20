import Link from "next/link";
import { ABILITY_LABELS } from "@/lib/validation/character";
import type { CharacterDto } from "@/server/services/campaigns/characters";
import {
  createCharacterAction,
  deleteCharacterAction,
  updateCharacterAction,
} from "../character-actions";

const input =
  "mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm";

function CharacterForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: CharacterDto;
  submitLabel: string;
  cancelHref?: string;
}) {
  const score = (label: string) =>
    initial?.abilityScores.find((s) => s.label === label)?.value;
  return (
    <form
      action={action}
      className="grid grid-cols-2 gap-2 rounded border border-border bg-surface p-3 sm:grid-cols-6"
    >
      <label className="col-span-2 text-xs sm:col-span-3">
        Character name *
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={initial?.name}
          className={input}
        />
      </label>
      <label className="col-span-2 text-xs sm:col-span-3">
        Player
        <input
          name="playerName"
          maxLength={80}
          defaultValue={initial?.playerName ?? ""}
          className={input}
        />
      </label>
      <label className="text-xs sm:col-span-2">
        Race
        <input
          name="race"
          maxLength={80}
          placeholder="e.g. Dwarf"
          defaultValue={initial?.race ?? ""}
          className={input}
        />
      </label>
      <label className="text-xs sm:col-span-2">
        Class
        <input
          name="characterClass"
          maxLength={80}
          placeholder="e.g. Cleric"
          defaultValue={initial?.characterClass ?? ""}
          className={input}
        />
      </label>
      <label className="text-xs">
        Level
        <input
          name="level"
          type="number"
          min={1}
          max={20}
          defaultValue={initial?.level ?? ""}
          className={input}
        />
      </label>
      <label className="text-xs">
        Max HP *
        <input
          name="maxHp"
          type="number"
          min={1}
          required
          defaultValue={initial?.maxHp}
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
          defaultValue={initial?.armorClass}
          className={input}
        />
      </label>
      <label className="text-xs">
        Initiative bonus
        <input
          name="initiativeModifier"
          type="number"
          min={-20}
          max={20}
          defaultValue={initial?.initiativeModifier ?? 0}
          className={input}
        />
      </label>
      <label className="text-xs">
        Speed
        <input
          name="speed"
          maxLength={100}
          placeholder="30 ft."
          defaultValue={initial?.speed ?? ""}
          className={input}
        />
      </label>
      <label className="text-xs">
        Passive Perception
        <input
          name="passivePerception"
          type="number"
          min={0}
          max={99}
          defaultValue={initial?.passivePerception ?? ""}
          className={input}
        />
      </label>
      <fieldset className="col-span-2 grid grid-cols-6 gap-2 sm:col-span-6">
        <legend className="text-xs">Ability scores (optional)</legend>
        {ABILITY_LABELS.map((label) => (
          <label key={label} className="text-xs">
            {label}
            <input
              name={`ability-${label}`}
              type="number"
              min={1}
              max={30}
              defaultValue={score(label) ?? ""}
              className={input}
            />
          </label>
        ))}
      </fieldset>
      <label className="col-span-2 text-xs sm:col-span-6">
        Notes
        <textarea
          name="notes"
          rows={3}
          maxLength={5000}
          placeholder="Resistances, key features, spell save DC, anything useful at the table"
          defaultValue={initial?.notes ?? ""}
          className={input}
        />
      </label>
      <label className="col-span-2 text-xs sm:col-span-6">
        Backstory
        <textarea
          name="backstory"
          rows={8}
          maxLength={50000}
          placeholder="Origins, goals, relationships, secrets. Shown in a popup so it can be long."
          defaultValue={initial?.backstory ?? ""}
          className={input}
        />
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-6">
        <button className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark">
          {submitLabel}
        </button>
        {cancelHref && (
          <Link
            href={cancelHref}
            className="rounded border border-border bg-white px-3 py-1.5 text-sm"
          >
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}

export function Characters({
  campaignId,
  characters,
  editId,
  backstoryId,
}: {
  campaignId: string;
  characters: CharacterDto[];
  editId: string | undefined;
  backstoryId?: string;
}) {
  const reading = characters.find((c) => c.id === backstoryId);
  const base = `/campaigns/${campaignId}`;
  return (
    <section className="mt-10" aria-label="Player characters">
      <h2 className="text-lg font-semibold">Player characters</h2>
      {characters.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No player characters yet. Add the party below; they can then be added
          to encounters and to any running combat.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {characters.map((pc) =>
            pc.id === editId ? (
              <li key={pc.id}>
                <CharacterForm
                  action={updateCharacterAction.bind(null, campaignId, pc.id)}
                  initial={pc}
                  submitLabel="Save character"
                  cancelHref={base}
                />
              </li>
            ) : (
              <li
                key={pc.id}
                className="rounded border border-border bg-surface p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {pc.name}
                    <span className="ml-2 font-normal text-muted">
                      {[
                        pc.race,
                        pc.characterClass,
                        pc.level !== null && `level ${pc.level}`,
                        pc.playerName && `played by ${pc.playerName}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    {pc.backstory && (
                      <Link
                        href={`${base}?backstory=${pc.id}`}
                        className="text-forest underline"
                      >
                        Backstory
                      </Link>
                    )}
                    <Link
                      href={`${base}?editCharacter=${pc.id}`}
                      className="text-forest underline"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteCharacterAction.bind(
                        null,
                        campaignId,
                        pc.id,
                      )}
                    >
                      <button className="text-red-700 underline">Remove</button>
                    </form>
                  </div>
                </div>
                <p className="mt-1 text-muted">
                  HP {pc.maxHp} · AC {pc.armorClass} · Init{" "}
                  {pc.initiativeModifier >= 0 ? "+" : ""}
                  {pc.initiativeModifier}
                  {pc.speed ? ` · ${pc.speed}` : ""}
                  {pc.passivePerception !== null
                    ? ` · Passive Perception ${pc.passivePerception}`
                    : ""}
                </p>
                {pc.abilityScores.length > 0 && (
                  <p className="mt-1 text-muted">
                    {pc.abilityScores
                      .map((s) => `${s.label} ${s.value}`)
                      .join(" · ")}
                  </p>
                )}
                {pc.notes && (
                  <p className="mt-1 whitespace-pre-wrap">{pc.notes}</p>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {reading && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${reading.name} backstory`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-10"
        >
          <Link
            href={base}
            aria-label="Close backstory"
            className="fixed inset-0 -z-10 cursor-default"
          />
          <article className="w-full max-w-2xl rounded border border-border bg-white p-5 shadow-lg">
            <header className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{reading.name}</h3>
                <p className="text-sm text-muted">
                  {[
                    reading.race,
                    reading.characterClass,
                    reading.level !== null && `level ${reading.level}`,
                    reading.playerName && `played by ${reading.playerName}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link
                href={base}
                className="rounded border border-border px-2 py-1 text-sm hover:bg-surface"
              >
                Close
              </Link>
            </header>
            <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
              {reading.backstory}
            </div>
            <Link
              href={`${base}?editCharacter=${reading.id}`}
              className="mt-4 inline-block text-sm text-forest underline"
            >
              Edit character
            </Link>
          </article>
        </div>
      )}
      {!editId && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">Add a player character</h3>
          <CharacterForm
            action={createCharacterAction.bind(null, campaignId)}
            submitLabel="Add character"
          />
        </div>
      )}
    </section>
  );
}
