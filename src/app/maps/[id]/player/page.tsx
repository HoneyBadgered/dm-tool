import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import { getBattleMap } from "@/server/services/maps/battle-maps";
import { playerView } from "@/lib/battle-map-vision";
import { PlayerViewer } from "./player-viewer";

export default function PlayerMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id: param } = await params;
  const map = await getBattleMap(await resolveSlugParam("map", param));
  if (!map) notFound();
  await redirectToSlugUrl({
    kind: "map",
    param,
    entity: map,
    path: (slug) => `/maps/${slug}/player`,
  });
  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[420px] flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <h1 className="text-lg font-semibold">{map.name} — player view</h1>
        <Link href={`/maps/${map.id}`} className="text-muted underline">
          Back to DM editor
        </Link>
      </div>
      <PlayerViewer
        mapId={map.id}
        background={map.background}
        initialVersion={map.version}
        initialDoc={playerView(map.doc)}
      />
    </div>
  );
}
