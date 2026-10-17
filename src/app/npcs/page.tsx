import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { Notice } from "./notice";
import { listNpcs } from "@/server/services/npcs/npcs";

export default function NpcsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string | string[] }>;
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
  searchParams: Promise<{ notice?: string; q?: string | string[] }>;
}) {
  await io();
  const { notice, q: rawQuery } = await searchParams;
  const npcs = await listNpcs();
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const overlongQuery = query.length > 100;
  const normalizedQuery = query.toLocaleLowerCase();
  const visible = overlongQuery
    ? []
    : npcs.filter((npc) =>
        [
          npc.name,
          npc.role ?? "",
          npc.location ?? "",
          npc.notes ?? "",
          npc.campaignName,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      );
  return (
    <>
      <Notice notice={notice} />
      <form action="/npcs" role="search" className="mb-4 flex gap-2">
        <label className="grow">
          <span className="sr-only">Search NPCs</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder="Search name, role, location, notes, or campaign"
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
        <p role="alert" className="text-sm text-red-700">
          Search terms must be 100 characters or fewer.
        </p>
      ) : npcs.length === 0 ? (
        <p className="text-sm text-muted">
          No NPCs yet. Create your first NPC to get started.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">
          No NPCs match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => (
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
