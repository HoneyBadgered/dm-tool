import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { listStorySessions } from "@/server/services/story/story";
import { createStorySessionAction, updateStorySessionAction } from "./actions";

type SearchParams = Promise<{
  notice?: string | string[];
  q?: string | string[];
}>;

const notices: Record<string, { text: string; error: boolean }> = {
  created: { text: "Story session created.", error: false },
  updated: { text: "Story session updated.", error: false },
  "invalid-input": {
    text: "Check the session fields and try again.",
    error: true,
  },
  "campaign-missing": {
    text: "That campaign is unavailable. Choose an active campaign.",
    error: true,
  },
  "session-conflict": {
    text: "That session number is already in use in this campaign.",
    error: true,
  },
  "session-missing": {
    text: "That session is no longer available.",
    error: true,
  },
};

export default function StoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading story tracker">
          Gathering campaign sessions.
        </Panel>
      }
    >
      <StoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StoryContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, campaigns, sessions] = await Promise.all([
    searchParams,
    listCampaigns(),
    listStorySessions(),
  ]);
  const noticeKey = typeof params.notice === "string" ? params.notice : "";
  const notice = notices[noticeKey];
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const overlongQuery = query.length > 100;
  const normalizedQuery = query.toLocaleLowerCase();
  const visibleSessions = overlongQuery
    ? []
    : sessions.filter((session) =>
        [
          session.title ?? "",
          session.notes,
          session.campaignName,
          String(session.number),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      );
  const inputClass =
    "w-full rounded border border-border bg-surface px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Story Tracker</h1>
      <p className="mt-1 text-sm text-muted">
        Record session dates, titles, and recaps across campaigns.
      </p>
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`mt-4 rounded border p-3 text-sm ${
            notice.error
              ? "border-red-700 bg-red-50 text-red-700"
              : "border-forest bg-surface text-forest"
          }`}
        >
          {notice.text}
        </p>
      )}

      {campaigns.length === 0 ? (
        <Panel title="Create a campaign first">
          Story sessions belong to a campaign.{" "}
          <Link href="/campaigns/new" className="text-forest underline">
            Create a campaign
          </Link>{" "}
          to start a story timeline.
        </Panel>
      ) : (
        <details
          className="mt-4 rounded border border-border bg-surface p-4"
          open
        >
          <summary className="cursor-pointer font-semibold text-forest">
            Record a session
          </summary>
          <form
            action={createStorySessionAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <label className="text-sm">
              <span className="mb-1 block font-medium">Campaign</span>
              <select
                name="campaignId"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a campaign
                </option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Session number</span>
              <input
                name="number"
                type="number"
                min={1}
                required
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Title (optional)</span>
              <input name="title" maxLength={120} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Played on (optional)
              </span>
              <input name="playedAt" type="date" className={inputClass} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Session notes</span>
              <textarea
                name="notes"
                rows={5}
                maxLength={10000}
                placeholder="Recap events, clues, decisions, and open threads"
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
            >
              Save session
            </button>
          </form>
        </details>
      )}

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Session timeline</h2>
          <span className="text-sm text-muted">
            {visibleSessions.length} of {sessions.length}{" "}
            {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>
        <form action="/story" role="search" className="my-3 flex gap-2">
          <label className="grow">
            <span className="sr-only">Search story sessions</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              maxLength={100}
              placeholder="Search titles, recaps, or campaigns"
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
          <Panel title="Search is too long">
            Search terms must be 100 characters or fewer.
          </Panel>
        ) : sessions.length === 0 ? (
          <Panel title="No sessions recorded">
            Add a campaign session above to begin your timeline.
          </Panel>
        ) : visibleSessions.length === 0 ? (
          <Panel title="No matching sessions">
            No session recaps match &ldquo;{query}&rdquo;.
          </Panel>
        ) : (
          <ol className="mt-3 space-y-3">
            {visibleSessions.map((session) => (
              <li
                key={session.id}
                className="rounded border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-forest">
                    {session.title || `Session ${session.number}`}
                  </h3>
                  <span className="text-sm text-muted">
                    {session.playedAt
                      ? session.playedAt.toLocaleDateString()
                      : `Session ${session.number}`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  <Link
                    href={`/campaigns/${session.campaignId}`}
                    className="text-forest underline"
                  >
                    {session.campaignName}
                  </Link>
                  {" · "}Session {session.number}
                  {session.isCurrent && " · Current session"}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {session.notes || "No recap recorded."}
                </p>
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-sm text-forest">
                    Edit session
                  </summary>
                  <form
                    action={updateStorySessionAction.bind(null, session.id)}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Campaign</span>
                      <select
                        name="campaignId"
                        required
                        defaultValue={session.campaignId}
                        className={inputClass}
                      >
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">
                        Session number
                      </span>
                      <input
                        name="number"
                        type="number"
                        min={1}
                        required
                        defaultValue={session.number}
                        className={inputClass}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Title</span>
                      <input
                        name="title"
                        maxLength={120}
                        defaultValue={session.title ?? ""}
                        className={inputClass}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Played on</span>
                      <input
                        name="playedAt"
                        type="date"
                        defaultValue={
                          session.playedAt?.toISOString().slice(0, 10) ?? ""
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium">Notes</span>
                      <textarea
                        name="notes"
                        rows={4}
                        maxLength={10000}
                        defaultValue={session.notes}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="submit"
                      className="w-fit rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
                    >
                      Save changes
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
