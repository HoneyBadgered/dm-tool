import Link from "next/link";
import { listMonsters } from "@/server/services/rules/rules";
import type { CreatureOptions } from "@/server/services/combat/encounter-builder";
import { ActionForm } from "./action-form";
import { addEntryAction } from "./builder-actions";
import { EntryFields, field } from "./entry-fields";

export const ADD_TABS = [
  { value: "monster", label: "Library monster" },
  { value: "npc", label: "NPC" },
  { value: "player", label: "Player character" },
  { value: "custom", label: "Custom creature" },
] as const;

export type AddTab = (typeof ADD_TABS)[number]["value"];

export function parseTab(value: string | undefined): AddTab {
  return ADD_TABS.find((t) => t.value === value)?.value ?? "monster";
}

const RESULT_LIMIT = 25;

export async function AddPanel({
  encounterId,
  tab,
  options,
  query,
  challengeRating,
}: {
  encounterId: string;
  tab: AddTab;
  options: CreatureOptions;
  query: string;
  challengeRating: string;
}) {
  return (
    <section
      aria-label="Add combatants"
      className="rounded border border-border bg-surface p-3"
    >
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {ADD_TABS.map((t) => (
          <Link
            key={t.value}
            role="tab"
            aria-selected={t.value === tab}
            href={`/encounters/${encounterId}?add=${t.value}#add`}
            className={
              t.value === tab
                ? "rounded bg-primary px-3 py-1 text-sm text-on-primary"
                : "rounded border border-border px-3 py-1 text-sm hover:bg-input"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "monster" && (
        <MonsterSearch
          encounterId={encounterId}
          query={query}
          challengeRating={challengeRating}
        />
      )}
      {tab === "npc" && <NpcForm encounterId={encounterId} options={options} />}
      {tab === "player" && (
        <PlayerList encounterId={encounterId} options={options} />
      )}
      {tab === "custom" && (
        <ActionForm
          action={addEntryAction.bind(null, encounterId, "custom")}
          submitLabel="Add creature"
          className="space-y-2"
        >
          <EntryFields kind="custom" hasBasis={false} />
        </ActionForm>
      )}
    </section>
  );
}

async function MonsterSearch({
  encounterId,
  query,
  challengeRating,
}: {
  encounterId: string;
  query: string;
  challengeRating: string;
}) {
  let list;
  try {
    list = await listMonsters({
      query,
      ...(challengeRating ? { challengeRating } : {}),
    });
  } catch (e) {
    if (e instanceof RangeError)
      return (
        <p role="alert" className="text-sm text-danger">
          {e.message}
        </p>
      );
    throw e;
  }
  const shown = list.items.slice(0, RESULT_LIMIT);
  return (
    <div>
      <form className="mb-3 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="add" value="monster" />
        <label className="min-w-40 grow">
          <span className="sr-only">Search monsters</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder="Search library monsters"
            className="w-full rounded border border-border bg-input px-3 py-1.5 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">Challenge rating</span>
          <select
            name="cr"
            defaultValue={challengeRating}
            className="rounded border border-border bg-input px-2 py-1.5 text-sm"
          >
            <option value="">Any CR</option>
            {list.challengeRatings.map((cr) => (
              <option key={cr} value={cr}>
                CR {cr}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover">
          Search
        </button>
      </form>
      {list.items.length === 0 ? (
        <p className="text-sm text-muted">
          {list.challengeRatings.length === 0
            ? "The rules library has no imported monsters yet. Run an import from the Rules Library."
            : "No monsters match."}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Showing {shown.length} of {list.items.length}
            {list.items.length > shown.length &&
              " — refine the search to see more"}
          </p>
          <ul className="space-y-1">
            {shown.map((monster) => (
              <li key={monster.id}>
                <ActionForm
                  action={addEntryAction.bind(null, encounterId, "monster")}
                  submitLabel="Add"
                  className="flex flex-wrap items-center gap-2 rounded border border-border bg-input p-2"
                >
                  <input type="hidden" name="ruleEntryId" value={monster.id} />
                  <input
                    type="hidden"
                    name="defaultLabel"
                    value={monster.name}
                  />
                  <span className="min-w-40 grow text-sm">
                    <span className="font-medium">{monster.name}</span>
                    <span className="block text-xs text-muted">
                      CR {monster.challengeRating} · {monster.size}{" "}
                      {monster.type} · AC {monster.armorClass} · HP{" "}
                      {monster.hitPoints ?? "?"}
                    </span>
                  </span>
                  <label className="text-xs">
                    <span className="sr-only">
                      Display name for {monster.name}
                    </span>
                    <input
                      name="label"
                      maxLength={80}
                      placeholder="Display name"
                      className={`${field} w-36`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="sr-only">Copies of {monster.name}</span>
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={1}
                      className={`${field} w-16`}
                    />
                  </label>
                </ActionForm>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function NpcForm({
  encounterId,
  options,
}: {
  encounterId: string;
  options: CreatureOptions;
}) {
  if (options.npcs.length === 0)
    return (
      <p className="text-sm text-muted">
        This campaign has no NPCs yet.{" "}
        <Link href="/npcs/new" className="underline">
          Create an NPC
        </Link>{" "}
        or add a custom creature instead.
      </p>
    );
  return (
    <ActionForm
      action={addEntryAction.bind(null, encounterId, "npc")}
      submitLabel="Add NPC"
      className="space-y-2"
    >
      <label className="block text-xs">
        NPC *
        <select name="npcId" required defaultValue="" className={field}>
          <option value="" disabled>
            Select an NPC
          </option>
          {options.npcs.map((npc) => (
            <option key={npc.id} value={npc.id}>
              {npc.name}
              {npc.role ? ` — ${npc.role}` : ""}
            </option>
          ))}
        </select>
      </label>
      <EntryFields kind="npc" hasBasis={false} />
    </ActionForm>
  );
}

function PlayerList({
  encounterId,
  options,
}: {
  encounterId: string;
  options: CreatureOptions;
}) {
  if (options.playerCharacters.length === 0)
    return (
      <p className="text-sm text-muted">
        This campaign has no player characters yet. Add them on the campaign
        page, then they will appear here.
      </p>
    );
  return (
    <ul className="space-y-1">
      {options.playerCharacters.map((pc) => (
        <li key={pc.id}>
          <ActionForm
            action={addEntryAction.bind(null, encounterId, "player_character")}
            submitLabel="Add"
            className="flex flex-wrap items-center gap-2 rounded border border-border bg-input p-2"
          >
            <input type="hidden" name="playerCharacterId" value={pc.id} />
            <input type="hidden" name="defaultLabel" value={pc.name} />
            <span className="grow text-sm">
              <span className="font-medium">{pc.name}</span>
              <span className="block text-xs text-muted">
                {pc.playerName ? `${pc.playerName} · ` : ""}AC {pc.armorClass} ·
                HP {pc.maxHp}
              </span>
            </span>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
