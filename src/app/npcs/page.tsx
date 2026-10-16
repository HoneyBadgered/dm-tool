import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { Notice } from "./notice";
import { listNpcs } from "@/server/services/npcs/npcs";

export default function NpcsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">NPCs</h1>
        <Link
          href="/npcs/new"
          className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark"
        >
          New NPC
        </Link>
      </div>
      <Suspense
        fallback={
          <div
            className="h-16 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
            aria-label="Loading NPCs"
          />
        }
      >
        <NpcsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NpcsContent({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await io();
  const { notice } = await searchParams;
  const npcs = await listNpcs();
  return (
    <>
      <Notice notice={notice} />
      {npcs.length === 0 ? (
        <p className="text-sm text-muted">
          No NPCs yet. Create your first NPC to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {npcs.map((n) => (
            <li key={n.id}>
              <Link
                href={`/npcs/${n.id}`}
                className="block rounded border border-border bg-surface p-3 hover:bg-white"
              >
                <span className="font-medium">{n.name}</span>
                <span className="block text-sm text-muted">
                  {n.campaignName}
                  {n.role ? ` · ${n.role}` : ""}
                  {n.location ? ` · ${n.location}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
