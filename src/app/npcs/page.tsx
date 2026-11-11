import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { Notice } from "./notice";
import { listNpcs } from "@/server/services/npcs/npcs";

function identity(n: {
  race: string | null;
  characterClass: string | null;
  level: number | null;
  challengeRating: string | null;
}) {
  return [
    n.race,
    n.characterClass,
    n.level !== null && `level ${n.level}`,
    n.challengeRating && `CR ${n.challengeRating}`,
  ]
    .filter(Boolean)
    .join(" ");
}

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
          className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover"
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
          npc.titleAlias ?? "",
          npc.role ?? "",
          npc.status,
          npc.race ?? "",
          npc.characterClass ?? "",
          npc.challengeRating ?? "",
          npc.location ?? "",
          npc.faction ?? "",
          npc.quickSummary ?? "",
          npc.personality ?? "",
          npc.motivation ?? "",
          npc.secret ?? "",
          npc.notes ?? "",
          npc.dmNotes ?? "",
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
            placeholder="Search name, role, summary, location, notes, or campaign"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover"
        >
          Search
        </button>
      </form>
      {overlongQuery ? (
        <p role="alert" className="text-sm text-danger">
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
                className="block rounded border border-border bg-surface p-3 hover:bg-input"
              >
                <span className="font-medium">{n.name}</span>
                {n.titleAlias && (
                  <span className="ml-2 text-sm text-muted">
                    {n.titleAlias}
                  </span>
                )}
                {n.quickSummary && (
                  <span className="mt-1 block text-sm">{n.quickSummary}</span>
                )}
                <span className="block text-sm text-muted">
                  {n.campaignName}
                  {n.role ? ` · ${n.role}` : ""}
                  {identity(n) ? ` · ${identity(n)}` : ""}
                  {n.location ? ` · ${n.location}` : ""}
                  {n.faction ? ` · ${n.faction}` : ""}
                  {` · ${n.status}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
