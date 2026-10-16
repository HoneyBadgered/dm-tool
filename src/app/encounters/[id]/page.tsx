import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { canTransition } from "@/lib/validation/encounter";
import { getEncounter } from "@/server/services/encounters/encounters";
import {
  deleteEncounterAction,
  resolveAction,
  setActiveAction,
  updateEncounterAction,
} from "../actions";
import { DeleteButton } from "../delete-button";
import { EncounterForm } from "../encounter-form";
import { Notice } from "../notice";

type SP = Promise<{ edit?: string; notice?: string }>;

export default function EncounterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading encounter"
        />
      }
    >
      <EncounterDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EncounterDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  await io();
  const { id } = await params;
  const { edit, notice } = await searchParams;
  const encounter = await getEncounter(id);
  if (!encounter) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/encounters" className="text-sm text-muted hover:underline">
        ← Encounters
      </Link>
      <div className="mt-4">
        <Notice notice={notice} />
      </div>
      {edit !== undefined ? (
        <>
          <h1 className="my-4 text-xl font-semibold">Edit encounter</h1>
          <p className="mb-4 text-sm text-muted">
            Campaign: {encounter.campaignName}
          </p>
          <EncounterForm
            action={updateEncounterAction.bind(null, encounter.id)}
            initial={encounter}
            submitLabel="Save"
            cancelHref={`/encounters/${encounter.id}`}
          />
        </>
      ) : (
        <>
          <div className="my-4 flex items-center gap-3">
            <h1 className="text-xl font-semibold">{encounter.title}</h1>
            <StatusBadge status={encounter.status} />
          </div>
          <p className="text-sm">
            <span className="font-medium">Campaign: </span>
            <Link
              href={`/campaigns/${encounter.campaignId}`}
              className="text-muted underline"
            >
              {encounter.campaignName}
            </Link>
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm text-muted">
            {encounter.notes ?? "No notes."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {canTransition(encounter.status, "active") && (
              <form action={setActiveAction.bind(null, encounter.id)}>
                <button
                  type="submit"
                  className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
                >
                  Set active
                </button>
              </form>
            )}
            {canTransition(encounter.status, "resolved") && (
              <form action={resolveAction.bind(null, encounter.id)}>
                <button
                  type="submit"
                  className="rounded border border-forest px-4 py-2 text-sm text-forest hover:bg-white"
                >
                  Resolve
                </button>
              </form>
            )}
            <Link
              href={`/encounters/${encounter.id}?edit`}
              className="rounded border border-border px-4 py-2 text-sm"
            >
              Edit
            </Link>
            <form action={deleteEncounterAction.bind(null, encounter.id)}>
              <DeleteButton />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
