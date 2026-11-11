import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { listBattleMaps } from "@/server/services/maps/battle-maps";
import { createMapAction, deleteMapAction } from "./actions";

const NOTICES: Record<string, string> = {
  deleted: "Map deleted.",
  invalid: "That map could not be saved. Check the name, size, and campaign.",
};

export default function MapsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-3xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading maps"
        />
      }
    >
      <Maps searchParams={searchParams} />
    </Suspense>
  );
}

async function Maps({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; notice?: string }>;
}) {
  await io();
  const { campaign, notice } = await searchParams;
  const campaigns = await listCampaigns();
  const withMaps = await Promise.all(
    campaigns.map(async (c) => ({ c, maps: await listBattleMaps(c.id) })),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Encounter maps</h1>
      {notice && NOTICES[notice] ? (
        <p
          role={notice === "invalid" ? "alert" : "status"}
          className="mb-4 rounded border border-border bg-surface p-3 text-sm"
        >
          {NOTICES[notice]}
        </p>
      ) : null}
      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">
          Create a campaign first, then add encounter maps to it.{" "}
          <Link href="/campaigns/new" className="text-link underline">
            New campaign
          </Link>
        </p>
      ) : null}
      <div className="space-y-6">
        {withMaps.map(({ c, maps }) => (
          <section
            key={c.id}
            className={`rounded border bg-surface p-4 ${campaign === c.id ? "border-primary" : "border-border"}`}
          >
            <h2 className="font-medium">{c.name}</h2>
            {maps.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No maps yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {maps.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between py-2"
                  >
                    <Link
                      href={`/maps/${b.id}`}
                      className="text-link underline"
                    >
                      {b.name}
                    </Link>
                    <span className="flex items-center gap-4">
                      <span className="text-muted">
                        {b.cols}×{b.rows} · {b.updatedAt.toLocaleDateString()}
                      </span>
                      <form action={deleteMapAction.bind(null, b.id)}>
                        <ConfirmButton message={`Delete map "${b.name}"?`}>
                          Delete
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={createMapAction} className="mt-3 flex gap-2 text-sm">
              <input type="hidden" name="campaignId" value={c.id} />
              <select
                name="layout"
                aria-label={`Map type for ${c.name}`}
                className="rounded border border-border bg-background px-2 py-1.5"
              >
                <option value="standard">Room (30×20)</option>
                <option value="overview">Overview (100×100, zoomed out)</option>
              </select>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="New map name"
                aria-label={`New map name for ${c.name}`}
                className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-1.5"
              />
              <button className="rounded bg-primary px-3 py-1.5 text-on-primary hover:bg-primary-hover">
                Create map
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
