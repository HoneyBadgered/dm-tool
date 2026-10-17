import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { getWorldBoard } from "@/server/services/world-board/world-board";

type SearchParams = Promise<{ q?: string | string[] }>;

export default function WorldPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading World Board">
          Gathering campaigns and character locations.
        </Panel>
      }
    >
      <WorldContent searchParams={searchParams} />
    </Suspense>
  );
}

async function WorldContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const overlongQuery = query.length > 100;
  const campaigns = overlongQuery ? [] : await getWorldBoard(query);
  const npcCount = campaigns.reduce(
    (total, campaign) => total + campaign.npcs.length,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">World Board</h1>
      <p className="mt-1 text-sm text-muted">
        A campaign-organized directory of places and people, built from the
        campaign and NPC records you already maintain.
      </p>

      <form action="/world" role="search" className="mt-4 flex gap-2">
        <label className="grow">
          <span className="sr-only">
            Search campaigns, locations, and people
          </span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder="Search campaigns, people, roles, locations, or notes"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Search
        </button>
      </form>

      {overlongQuery ? (
        <Panel title="Search is too long">
          Search terms must be 100 characters or fewer.
        </Panel>
      ) : campaigns.length === 0 ? (
        <Panel title={query ? "No matching world records" : "No campaigns yet"}>
          {query
            ? `No campaign, location, or NPC records match "${query}".`
            : "Create a campaign and add NPC locations to start building the world board."}
        </Panel>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted" role="status">
            {campaigns.length}{" "}
            {campaigns.length === 1 ? "campaign" : "campaigns"} · {npcCount}{" "}
            {npcCount === 1 ? "person" : "people"}
          </p>
          <ul className="mt-3 space-y-4">
            {campaigns.map((campaign) => {
              const grouped = new Map<string, typeof campaign.npcs>();
              for (const npc of campaign.npcs) {
                const location = npc.location?.trim() || "Location unknown";
                grouped.set(location, [...(grouped.get(location) ?? []), npc]);
              }
              return (
                <li key={campaign.id}>
                  <section className="rounded border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-base font-semibold text-forest">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="hover:underline"
                        >
                          {campaign.name}
                        </Link>
                      </h2>
                      <Link
                        href="/npcs/new"
                        className="text-sm text-forest underline"
                      >
                        Add NPC
                      </Link>
                    </div>
                    {campaign.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                        {campaign.description}
                      </p>
                    )}

                    {grouped.size === 0 ? (
                      <p className="mt-3 text-sm text-muted">
                        No NPCs in this campaign yet.
                      </p>
                    ) : (
                      <ul className="mt-3 grid gap-3 md:grid-cols-2">
                        {[...grouped.entries()]
                          .sort(([left], [right]) => left.localeCompare(right))
                          .map(([location, npcs]) => (
                            <li
                              key={location}
                              className="rounded border border-border p-3"
                            >
                              <h3 className="font-medium">{location}</h3>
                              <ul className="mt-2 space-y-2">
                                {npcs.map((npc) => (
                                  <li key={npc.id}>
                                    <Link
                                      href={`/npcs/${npc.id}`}
                                      className="text-sm font-medium text-forest underline"
                                    >
                                      {npc.name}
                                    </Link>
                                    {npc.role && (
                                      <span className="text-sm text-muted">
                                        {" "}
                                        · {npc.role}
                                      </span>
                                    )}
                                    {npc.notes && (
                                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                                        {npc.notes}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                      </ul>
                    )}
                  </section>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
