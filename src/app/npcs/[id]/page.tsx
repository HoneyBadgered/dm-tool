import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getNpc } from "@/server/services/npcs/npcs";
import { deleteNpcAction, updateNpcAction } from "../actions";
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
  const { id } = await params;
  const { edit, notice } = await searchParams;
  const npc = await getNpc(id);
  if (!npc) notFound();

  return (
    <div className="mx-auto max-w-xl">
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
            submitLabel="Save"
            cancelHref={`/npcs/${npc.id}`}
          />
        </>
      ) : (
        <>
          <h1 className="my-4 text-xl font-semibold">{npc.name}</h1>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline font-medium">Campaign: </dt>
              <dd className="inline text-muted">
                <Link
                  href={`/campaigns/${npc.campaignId}`}
                  className="underline"
                >
                  {npc.campaignName}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Role: </dt>
              <dd className="inline text-muted">{npc.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Location: </dt>
              <dd className="inline text-muted">{npc.location ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 whitespace-pre-wrap text-sm text-muted">
            {npc.notes ?? "No notes."}
          </p>
          <div className="mt-6 flex gap-2">
            <Link
              href={`/npcs/${npc.id}?edit`}
              className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
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
