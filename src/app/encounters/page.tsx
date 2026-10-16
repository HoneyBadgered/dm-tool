import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Notice } from "./notice";
import { listEncounters } from "@/server/services/encounters/encounters";

export default function EncountersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Encounters</h1>
        <Link
          href="/encounters/new"
          className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark"
        >
          New encounter
        </Link>
      </div>
      <Suspense
        fallback={
          <div
            className="h-16 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
            aria-label="Loading encounters"
          />
        }
      >
        <EncountersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EncountersContent({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await io();
  const { notice } = await searchParams;
  const encounters = await listEncounters();
  return (
    <>
      <Notice notice={notice} />
      {encounters.length === 0 ? (
        <p className="text-sm text-muted">
          No encounters yet. Create your first encounter to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {encounters.map((e) => (
            <li key={e.id}>
              <Link
                href={`/encounters/${e.id}`}
                className="flex items-center justify-between gap-3 rounded border border-border bg-surface p-3 hover:bg-white"
              >
                <span>
                  <span className="font-medium">{e.title}</span>
                  <span className="block text-sm text-muted">
                    {e.campaignName}
                  </span>
                </span>
                <StatusBadge status={e.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
