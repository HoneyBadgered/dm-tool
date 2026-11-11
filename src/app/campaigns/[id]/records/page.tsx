import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import {
  RECORD_KINDS,
  RECORD_KIND_LABELS,
  type RecordKind,
} from "@/lib/validation/board";
import { getCampaign } from "@/server/services/campaigns/campaigns";
import { listRecords } from "@/server/services/story/records";
import {
  createRecordAction,
  deleteRecordAction,
  updateRecordAction,
} from "../../record-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { Notice } from "../../notice";

type Search = { kind?: string; edit?: string; notice?: string };

export default function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-3xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading records"
        />
      }
    >
      <Records params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const inputCls =
  "mt-1 block w-full rounded border border-border bg-surface px-3 py-2";

async function Records({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  await io();
  const { id: param } = await params;
  const sp = await searchParams;
  const { kind, edit, notice } = sp;
  const campaign = await getCampaign(await resolveSlugParam("campaign", param));
  if (!campaign) notFound();
  const id = campaign.id;
  await redirectToSlugUrl({
    kind: "campaign",
    param,
    entity: campaign,
    path: (slug) => `/campaigns/${slug}/records`,
    search: sp,
  });
  const filter = RECORD_KINDS.find((k) => k === kind) as RecordKind | undefined;
  const records = await listRecords(id);
  const shown = filter ? records.filter((r) => r.kind === filter) : records;
  const editing = edit ? records.find((r) => r.id === edit) : undefined;
  const base = `/campaigns/${id}/records`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-muted hover:underline"
      >
        ← {campaign.name}
      </Link>
      <h1 className="my-4 text-xl font-semibold">Story records</h1>
      <Notice notice={notice} />
      <nav
        aria-label="Filter by kind"
        className="mb-4 flex flex-wrap gap-2 text-sm"
      >
        <Link
          href={base}
          className={`rounded border px-2 py-1 ${!filter ? "border-primary text-link" : "border-border"}`}
        >
          All ({records.length})
        </Link>
        {RECORD_KINDS.map((k) => (
          <Link
            key={k}
            href={`${base}?kind=${k}`}
            className={`rounded border px-2 py-1 ${filter === k ? "border-primary text-link" : "border-border"}`}
          >
            {RECORD_KIND_LABELS[k]}s (
            {records.filter((r) => r.kind === k).length})
          </Link>
        ))}
      </nav>

      <form
        action={
          editing
            ? updateRecordAction.bind(null, id, editing.id)
            : createRecordAction.bind(null, id)
        }
        key={editing?.id ?? "new"}
        className="mb-6 space-y-3 rounded border border-border bg-surface p-4 text-sm"
      >
        <h2 className="font-medium">
          {editing ? "Edit record" : "New record"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label>
            Kind
            <select
              name="kind"
              defaultValue={editing?.kind ?? filter ?? "faction"}
              className={inputCls}
            >
              {RECORD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RECORD_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={editing?.name}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          Summary (shown on the board)
          <textarea
            name="summary"
            rows={3}
            maxLength={5000}
            defaultValue={editing?.summary ?? ""}
            className={inputCls}
          />
        </label>
        <label className="block">
          Private DM notes
          <textarea
            name="dmNotes"
            rows={3}
            maxLength={20000}
            defaultValue={editing?.dmNotes ?? ""}
            className={inputCls}
          />
        </label>
        <div className="flex gap-2">
          <button className="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover">
            {editing ? "Save" : "Create"}
          </button>
          {editing ? (
            <Link
              href={base}
              className="rounded border border-border px-4 py-2"
            >
              Cancel
            </Link>
          ) : null}
        </div>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          No records yet. Create factions, locations, quests, clues and events
          to link them on a board.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {shown.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div>
                <span className="mr-2 rounded bg-background px-1.5 py-0.5 text-xs text-muted">
                  {RECORD_KIND_LABELS[r.kind]}
                </span>
                <span className="font-medium">{r.name}</span>
                {r.summary ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted">
                    {r.summary}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-3">
                <Link
                  href={`${base}?edit=${r.id}`}
                  className="text-link underline"
                >
                  Edit
                </Link>
                <form action={deleteRecordAction.bind(null, id, r.id)}>
                  <ConfirmButton
                    message={`Delete "${r.name}"? Board cards linking to it will show as missing.`}
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
