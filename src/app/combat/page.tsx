import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { CombatTracker } from "@/components/combat/combat-tracker";
import {
  listAllOpenCombats,
  listRecentEndedCombats,
} from "@/server/services/combat/live-combat";

export default function CombatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Combat</h1>
      <Suspense
        fallback={
          <div
            className="h-20 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
            aria-label="Loading combats"
          />
        }
      >
        <LiveCombats />
      </Suspense>
      <Suspense fallback={null}>
        <EndedCombats />
      </Suspense>
      <section className="mt-8" aria-label="Quick tracker">
        <h2 className="text-lg font-semibold">Quick tracker</h2>
        <p className="mb-3 text-sm text-muted">
          A scratch tracker for improvised fights. It is not saved and does not
          use encounters or initiative order from a live combat.
        </p>
        <CombatTracker />
      </section>
    </div>
  );
}

async function LiveCombats() {
  await io();
  let combats: Awaited<ReturnType<typeof listAllOpenCombats>> = [];
  let failed = false;
  try {
    combats = await listAllOpenCombats();
  } catch {
    failed = true;
  }
  return (
    <section aria-label="Live combats">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Live combats</h2>
        <Link
          href="/encounters"
          className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark"
        >
          Launch from an encounter
        </Link>
      </div>
      {failed ? (
        <p
          role="alert"
          className="rounded border border-red-700 bg-red-50 p-3 text-sm text-red-700"
        >
          Live combats could not be loaded. Make sure the database migrations
          are applied.
        </p>
      ) : combats.length === 0 ? (
        <p className="rounded border border-border bg-surface p-3 text-sm text-muted">
          No combat is running. Open a saved encounter and press Launch to start
          one.
        </p>
      ) : (
        <ul className="space-y-1">
          {combats.map((c) => (
            <li key={c.id}>
              <Link
                href={`/combats/${c.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-sm hover:bg-white"
              >
                <span className="font-medium">
                  {c.name ?? c.encounter?.title ?? "Combat"}
                </span>
                <span className="text-muted">
                  {c.campaign.name} · {c.status}
                  {c.status !== "setup" && `, round ${c.round}`} · saved{" "}
                  {c.updatedAt.toLocaleString("en-US", { hour12: false })}
                </span>
                <span className="rounded bg-forest px-2 py-0.5 text-xs text-white">
                  Resume combat
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function EndedCombats() {
  await io();
  let ended: Awaited<ReturnType<typeof listRecentEndedCombats>> = [];
  try {
    ended = await listRecentEndedCombats();
  } catch {
    return null;
  }
  if (ended.length === 0) return null;
  return (
    <section className="mt-8" aria-label="Past combats">
      <h2 className="mb-2 text-lg font-semibold">Past combats</h2>
      <ul className="space-y-1">
        {ended.map((c) => (
          <li key={c.id}>
            <Link
              href={`/combats/${c.id}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-sm hover:bg-white"
            >
              <span className="font-medium">
                {c.name ?? c.encounter?.title ?? "Combat"}
              </span>
              <span className="text-muted">
                {c.campaign.name} · ended after round {c.round}
                {c.endedAt &&
                  ` · ${c.endedAt.toLocaleString("en-US", { hour12: false })}`}{" "}
                · view history
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
