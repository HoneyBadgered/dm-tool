import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import {
  getBattleMap,
  listBattleMaps,
  listParentMaps,
} from "@/server/services/maps/battle-maps";
import { getCombatInfo, getRecordInfo } from "@/server/services/maps/map-links";
import { listOpenCombats } from "@/server/services/combat/live-combat";
import { linkKey, type RecordInfo } from "@/lib/battle-map-links";
import { renameMapAction } from "../actions";
import { MapEditor } from "./map-editor";

export default function MapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="h-96 animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading map"
        />
      }
    >
      <MapView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MapView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await io();
  const { id: param } = await params;
  const sp = await searchParams;
  const { notice } = sp;
  const map = await getBattleMap(await resolveSlugParam("map", param));
  if (!map) notFound();
  await redirectToSlugUrl({
    kind: "map",
    param,
    entity: map,
    path: (slug) => `/maps/${slug}`,
    search: sp,
  });
  const [campaignMaps, parents, combat, openCombats] = await Promise.all([
    listBattleMaps(map.campaignId),
    listParentMaps(map.id, map.campaignId),
    map.combatId ? getCombatInfo(map.combatId, map.campaignId) : null,
    listOpenCombats(map.campaignId),
  ]);
  const recordLinks = new Map(
    map.doc.tokens.flatMap((t) =>
      t.link && t.link.kind !== "combatant" ? [[linkKey(t.link), t.link]] : [],
    ),
  );
  const records: Record<string, RecordInfo> = {};
  await Promise.all(
    [...recordLinks].map(async ([key, link]) => {
      const info = await getRecordInfo(link, map.campaignId);
      if (info) records[key] = info;
    }),
  );
  const others = campaignMaps
    .filter((m) => m.id !== map.id)
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/maps" className="text-sm text-muted hover:text-foreground">
          ← Maps
        </Link>
        <form
          action={renameMapAction.bind(null, map.id)}
          className="flex gap-2"
        >
          <input
            name="name"
            defaultValue={map.name}
            required
            maxLength={120}
            aria-label="Map name"
            className="rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold hover:border-border"
          />
          <button className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm hover:bg-foreground/10">
            Rename
          </button>
        </form>
        {parents.map((p) => (
          <Link
            key={p.id}
            href={`/maps/${p.id}`}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm hover:bg-foreground/10"
          >
            ↑ {p.name}
          </Link>
        ))}
        {notice === "invalid" ? (
          <span role="alert" className="text-sm text-danger">
            Could not rename.
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <MapEditor
          map={map}
          otherMaps={others}
          combat={combat}
          records={records}
          openCombats={openCombats.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            round: c.round,
          }))}
        />
      </div>
    </div>
  );
}
