import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { canTransition } from "@/lib/validation/encounter";
import { getEncounter } from "@/server/services/encounters/encounters";
import {
  getBuilderView,
  listCreatureOptions,
} from "@/server/services/combat/encounter-builder";
import {
  resolveAction,
  setActiveAction,
  updateEncounterAction,
} from "../actions";
import {
  deleteEncounterTemplateAction,
  duplicateEncounterAction,
  launchCombatAction,
} from "../builder-actions";
import { AddPanel, parseTab } from "../add-panel";
import { Lineup } from "../lineup";
import { DeleteButton } from "../delete-button";
import { EncounterForm } from "../encounter-form";
import { Notice } from "../notice";

type SP = Promise<{
  edit?: string;
  notice?: string;
  error?: string;
  add?: string;
  q?: string | string[];
  cr?: string | string[];
}>;

const first = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

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
  const { id: param } = await params;
  const sp = await searchParams;
  const { edit, notice, error, add, q, cr } = sp;
  const encounter = await getEncounter(
    await resolveSlugParam("encounter", param),
  );
  if (!encounter) notFound();
  await redirectToSlugUrl({
    kind: "encounter",
    param,
    entity: { id: encounter.id, name: encounter.title },
    path: (slug) => `/encounters/${slug}`,
    search: sp,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/encounters" className="text-sm text-muted hover:underline">
        ← Encounters
      </Link>
      <div className="mt-4">
        <Notice notice={notice} error={error} />
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
          {encounter.objective && (
            <p className="mt-3 text-sm">
              <span className="font-medium">Objective: </span>
              {encounter.objective}
            </p>
          )}
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
            {encounter.notes ?? "No notes."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/encounters/${encounter.id}?edit`}
              className="rounded border border-border px-3 py-1.5 text-sm"
            >
              Edit details
            </Link>
            <form action={duplicateEncounterAction.bind(null, encounter.id)}>
              <button
                type="submit"
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input"
              >
                Duplicate encounter
              </button>
            </form>
            {canTransition(encounter.status, "active") && (
              <form action={setActiveAction.bind(null, encounter.id)}>
                <button
                  type="submit"
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input"
                >
                  Mark active
                </button>
              </form>
            )}
            {canTransition(encounter.status, "resolved") && (
              <form action={resolveAction.bind(null, encounter.id)}>
                <button
                  type="submit"
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input"
                >
                  Mark resolved
                </button>
              </form>
            )}
            <form
              action={deleteEncounterTemplateAction.bind(null, encounter.id)}
            >
              <DeleteButton />
            </form>
          </div>

          <Builder
            encounterId={encounter.id}
            campaignId={encounter.campaignId}
            tab={parseTab(add)}
            query={first(q).trim()}
            challengeRating={first(cr)}
          />
        </>
      )}
    </div>
  );
}

async function Builder({
  encounterId,
  campaignId,
  tab,
  query,
  challengeRating,
}: {
  encounterId: string;
  campaignId: string;
  tab: ReturnType<typeof parseTab>;
  query: string;
  challengeRating: string;
}) {
  const [view, options] = await Promise.all([
    getBuilderView(encounterId),
    listCreatureOptions(campaignId),
  ]);
  const hasMissing = view.entries.some((e) => e.missing);
  const canLaunch =
    view.startingCount > 0 && !hasMissing && view.openCombats.length === 0;
  return (
    <>
      <section className="mt-6" aria-label="Combatant setup">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Combatants</h2>
          <p className="text-sm text-muted">
            {view.startingCount} starting
            {view.reinforcementCount > 0 &&
              `, ${view.reinforcementCount} in reserve`}
          </p>
        </div>
        <Lineup encounterId={encounterId} entries={view.entries} />
      </section>

      <section
        className="mt-4 rounded border border-border bg-surface p-3"
        aria-label="Launch combat"
      >
        <h2 className="text-sm font-semibold text-link">Launch</h2>
        <p className="mt-1 text-sm text-muted">
          Launching creates an independent live combat from a snapshot of this
          encounter. Editing the encounter later never changes a running combat.
          Combatants in wave 1 or higher are held back as reinforcements you can
          bring in during combat.
        </p>
        {view.openCombats.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {view.openCombats.map((combat) => (
              <li key={combat.id}>
                <Link href={`/combats/${combat.id}`} className="underline">
                  {combat.name ?? "Combat"} — {combat.status}, round{" "}
                  {combat.round}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {view.startingCount === 0 && (
          <p className="mt-2 text-sm text-muted">
            Add at least one starting combatant (wave 0) to launch.
          </p>
        )}
        {hasMissing && (
          <p role="alert" className="mt-2 text-sm text-danger">
            Some combatants reference records that no longer exist. Remove them
            to launch.
          </p>
        )}
        <form
          action={launchCombatAction.bind(null, encounterId)}
          className="mt-3"
        >
          <button
            type="submit"
            disabled={!canLaunch}
            className="rounded bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            Launch combat
          </button>
        </form>
      </section>

      <div id="add" className="mt-4">
        <AddPanel
          encounterId={encounterId}
          tab={tab}
          options={options}
          query={query}
          challengeRating={challengeRating}
        />
      </div>
    </>
  );
}
