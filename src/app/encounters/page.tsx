import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Notice } from "./notice";
import { listEncounters } from "@/server/services/encounters/encounters";

export default function EncountersPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    q?: string | string[];
    status?: string | string[];
  }>;
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
  searchParams: Promise<{
    notice?: string;
    q?: string | string[];
    status?: string | string[];
  }>;
}) {
  await io();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const encounters = await listEncounters();
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const selectedStatus =
    params.status === "planned" ||
    params.status === "active" ||
    params.status === "resolved"
      ? params.status
      : "";
  const overlongQuery = query.length > 100;
  const normalizedQuery = query.toLocaleLowerCase();
  const visible = overlongQuery
    ? []
    : encounters.filter(
        (encounter) =>
          (!selectedStatus || encounter.status === selectedStatus) &&
          [encounter.title, encounter.notes ?? "", encounter.campaignName].some(
            (value) => value.toLocaleLowerCase().includes(normalizedQuery),
          ),
      );
  return (
    <>
      <Notice notice={notice} />
      <form
        action="/encounters"
        role="search"
        className="mb-4 flex flex-wrap gap-2"
      >
        <label className="min-w-48 grow">
          <span className="sr-only">Search encounters</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder="Search encounter, notes, or campaign"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">Filter encounter status</span>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="rounded border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Filter
        </button>
      </form>
      {overlongQuery ? (
        <p role="alert" className="text-sm text-red-700">
          Search terms must be 100 characters or fewer.
        </p>
      ) : encounters.length === 0 ? (
        <p className="text-sm text-muted">
          No encounters yet. Create your first encounter to get started.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">
          No encounters match the selected filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => (
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
