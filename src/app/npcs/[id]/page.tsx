import Link from "next/link";
import Image from "next/image";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense, type ReactNode } from "react";
import { getNpc, listNpcRecordOptions } from "@/server/services/npcs/npcs";
import {
  deleteNpcAction,
  updateNpcAction,
  updateNpcNotesAction,
} from "../actions";
import { DeleteButton } from "../delete-button";
import { Notice } from "../notice";
import { NpcForm } from "../npc-form";

type SP = Promise<{ edit?: string; notice?: string }>;

export default function NpcDetailPage({
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
          aria-label="Loading NPC"
        />
      }
    >
      <NpcDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NpcDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  await io();
  const { id: param } = await params;
  const sp = await searchParams;
  const { edit, notice } = sp;
  const npc = await getNpc(await resolveSlugParam("npc", param));
  if (!npc) notFound();
  await redirectToSlugUrl({
    kind: "npc",
    param,
    entity: npc,
    path: (slug) => `/npcs/${slug}`,
    search: sp,
  });
  const records = await listNpcRecordOptions([npc.campaignId]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/npcs" className="text-sm text-muted hover:underline">
        ← NPCs
      </Link>
      <div className="mt-4">
        <Notice notice={notice} />
      </div>
      {edit !== undefined ? (
        <>
          <h1 className="my-4 text-xl font-semibold">Edit NPC</h1>
          <p className="mb-4 text-sm text-muted">
            Campaign: {npc.campaignName}
          </p>
          <NpcForm
            action={updateNpcAction.bind(null, npc.id)}
            initial={npc}
            records={records}
            submitLabel="Save"
            cancelHref={`/npcs/${npc.id}`}
          />
        </>
      ) : (
        <>
          <div className="my-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h1 className="text-2xl font-semibold">{npc.name}</h1>
                {npc.titleAlias && (
                  <p className="text-muted">“{npc.titleAlias}”</p>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {npc.role ?? "No role set"} · {capitalize(npc.status)}
                {npc.partyRelationship
                  ? ` · ${capitalize(npc.partyRelationship)} toward the party`
                  : ""}
              </p>
              {npc.quickSummary && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                  {npc.quickSummary}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span>
                  <strong>Race:</strong> {npc.race ?? "—"}
                </span>
                <span>
                  <strong>Class:</strong> {npc.characterClass ?? "—"}
                </span>
                {npc.level !== null && (
                  <span>
                    <strong>Level:</strong> {npc.level}
                  </span>
                )}
                {npc.challengeRating && (
                  <span>
                    <strong>CR:</strong> {npc.challengeRating}
                  </span>
                )}
                <span>
                  <strong>Location:</strong> {npc.location ?? "—"}
                </span>
                <span>
                  <strong>Faction:</strong> {npc.faction ?? "—"}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">
                Campaign:{" "}
                <Link
                  href={`/campaigns/${npc.campaignId}`}
                  className="underline"
                >
                  {npc.campaignName}
                </Link>
              </p>
            </div>
            {npc.portraitUrl && (
              <Image
                src={npc.portraitUrl}
                alt={`Portrait of ${npc.name}`}
                width={144}
                height={144}
                unoptimized
                className="h-36 w-36 rounded-lg border border-border object-cover"
              />
            )}
          </div>
          <div className="space-y-3">
            {hasValues(
              npc.appearance,
              npc.personality,
              npc.voiceMannerisms,
              npc.motivation,
              npc.goals,
              npc.currentPlans,
              npc.fearWeakness,
            ) && (
              <ProfileSection title="Roleplaying cues">
                <ProfileField label="Appearance" value={npc.appearance} />
                <ProfileField label="Personality" value={npc.personality} />
                <ProfileField
                  label="Voice / mannerisms"
                  value={npc.voiceMannerisms}
                />
                <ProfileField label="Motivation" value={npc.motivation} />
                <ProfileField label="Goals" value={npc.goals} />
                <ProfileField label="Current plans" value={npc.currentPlans} />
                <ProfileField
                  label="Fear / weakness"
                  value={npc.fearWeakness}
                />
              </ProfileSection>
            )}
            {hasValues(npc.secret, npc.knowledgeClues) && (
              <ProfileSection title="Secrets and information">
                <ProfileField label="Secret" value={npc.secret} />
                <ProfileField
                  label="Knowledge / clues"
                  value={npc.knowledgeClues}
                />
              </ProfileSection>
            )}
            {hasValues(
              npc.firstAppearance,
              npc.lastSeen,
              npc.statBlockReference,
              npc.initiativeCombatNotes,
            ) && (
              <ProfileSection title="Session and combat">
                <ProfileField
                  label="First appearance"
                  value={npc.firstAppearance}
                />
                <ProfileField label="Last seen" value={npc.lastSeen} />
                <StatBlockField value={npc.statBlockReference} />
                <ProfileField
                  label="Initiative / combat notes"
                  value={npc.initiativeCombatNotes}
                />
              </ProfileSection>
            )}
            {npc.notes && (
              <ProfileSection title="Notes">
                <form action={updateNpcNotesAction.bind(null, npc.id)}>
                  <label className="block text-sm">
                    <span className="sr-only">NPC notes</span>
                    <textarea
                      name="notes"
                      rows={4}
                      maxLength={5000}
                      defaultValue={npc.notes}
                      className="block w-full resize-y rounded border border-border bg-input px-3 py-2 leading-6"
                    />
                  </label>
                  <button
                    type="submit"
                    className="mt-2 rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover"
                  >
                    Save notes
                  </button>
                </form>
              </ProfileSection>
            )}
            {npc.relationshipNotes && (
              <ProfileSection title="Relationships">
                <ProfileField
                  label="Relationship notes"
                  value={npc.relationshipNotes}
                />
              </ProfileSection>
            )}
            {npc.dmNotes && (
              <ProfileSection title="DM notes">
                <ProfileField label="DM notes" value={npc.dmNotes} />
              </ProfileSection>
            )}
            {npc.backstory && (
              <details className="rounded-lg border border-border bg-surface p-4 text-sm shadow-sm">
                <summary className="cursor-pointer font-semibold">
                  Backstory
                </summary>
                <p className="mt-3 whitespace-pre-wrap leading-6 text-muted">
                  {npc.backstory}
                </p>
              </details>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <Link
              href={`/npcs/${npc.id}?edit`}
              className="rounded bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover"
            >
              Edit
            </Link>
            <form action={deleteNpcAction.bind(null, npc.id)}>
              <DeleteButton />
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </div>
  );
}

function hasValues(...values: (string | null)[]) {
  return values.some(Boolean);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StatBlockField({ value }: { value: string | null }) {
  const url = value && /^https?:\/\//i.test(value) ? value : null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Stat block reference
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="underline">
            {value}
          </a>
        ) : (
          value || "Not set"
        )}
      </p>
    </div>
  );
}
