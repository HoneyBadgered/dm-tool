import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { listMonsters } from "@/server/services/rules/rules";

type SearchParams = Promise<{
  q?: string | string[];
  size?: string | string[];
  type?: string | string[];
  cr?: string | string[];
}>;

export default function MonstersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading monsters">
          Checking imported creature records.
        </Panel>
      }
    >
      <MonstersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MonstersContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const size = typeof params.size === "string" ? params.size : "";
  const type = typeof params.type === "string" ? params.type : "";
  const challengeRating = typeof params.cr === "string" ? params.cr : "";
  const overlongQuery = query.length > 100;
  const monsters = await listMonsters({
    query: overlongQuery ? "" : query,
    size,
    type,
    challengeRating,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/rules" className="text-sm text-forest underline">
        Rules Library
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Monsters</h1>
      <p className="mt-1 text-sm text-muted">
        Browse imported 2024 API creature records. Each stat block retains its
        upstream source label.
      </p>

      <form
        action="/rules/monsters"
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        role="search"
      >
        <label className="sm:col-span-2 lg:col-span-2">
          <span className="sr-only">Search monsters by name</span>
          <input
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="Search monsters"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <FilterSelect
          name="size"
          label="Any size"
          value={size}
          options={monsters.sizes}
        />
        <FilterSelect
          name="type"
          label="Any type"
          value={type}
          options={monsters.types}
        />
        <FilterSelect
          name="cr"
          label="Any challenge rating"
          value={challengeRating}
          options={monsters.challengeRatings}
        />
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark sm:col-span-2 lg:col-span-5"
        >
          Apply filters
        </button>
      </form>

      {overlongQuery ? (
        <Panel title="Search is too long">
          Monster names must be searched with 100 characters or fewer.
        </Panel>
      ) : monsters.items.length === 0 && monsters.sizes.length === 0 ? (
        <Panel title="No imported monsters">
          No monster records have been imported yet. The library does not fetch
          live data while browsing. Use the{" "}
          <Link href="/rules/imports" className="text-forest underline">
            import management page
          </Link>{" "}
          to review a preview before a confirmed import.
        </Panel>
      ) : monsters.items.length === 0 ? (
        <Panel title="No matching monsters">
          No imported monsters match the selected search and filters.
        </Panel>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted" role="status">
            {monsters.items.length} matching{" "}
            {monsters.items.length === 1 ? "monster" : "monsters"}.
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {monsters.items.map((monster) => (
              <li key={monster.id}>
                <Link
                  href={`/rules/monsters/${monster.id}`}
                  className="block h-full rounded border border-border bg-surface p-4 hover:border-forest"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-forest">
                      {monster.name}
                    </h2>
                    <span className="text-xs text-muted">
                      CR {monster.challengeRating}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    {monster.size} {monster.type}, {monster.alignment}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    AC {monster.armorClass} · HP {monster.hitPoints ?? "—"}
                  </p>
                  <p className="mt-3 text-xs text-muted">
                    {monster.source.srdLabel} · D&D 5e API{" "}
                    {monster.source.apiEdition}; exact SRD revision{" "}
                    {monster.source.verifiedSrdRevision ??
                      "not verified against 5.2.1"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
