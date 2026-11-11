import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { listBoards } from "@/server/services/story/boards";
import { createBoardAction, deleteBoardAction } from "./actions";

const NOTICES: Record<string, string> = {
  deleted: "Board deleted.",
  invalid: "That board could not be saved. Check the name and campaign.",
};

export default function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-3xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading boards"
        />
      }
    >
      <Boards searchParams={searchParams} />
    </Suspense>
  );
}

async function Boards({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; notice?: string }>;
}) {
  await io();
  const { campaign, notice } = await searchParams;
  const campaigns = await listCampaigns();
  const withBoards = await Promise.all(
    campaigns.map(async (c) => ({ c, boards: await listBoards(c.id) })),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Story boards</h1>
      {notice && NOTICES[notice] ? (
        <p
          role={notice === "invalid" ? "alert" : "status"}
          className="mb-4 rounded border border-border bg-surface p-3 text-sm"
        >
          {NOTICES[notice]}
        </p>
      ) : null}
      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">
          Create a campaign first, then add story boards to it.{" "}
          <Link href="/campaigns/new" className="text-link underline">
            New campaign
          </Link>
        </p>
      ) : null}
      <div className="space-y-6">
        {withBoards.map(({ c, boards }) => (
          <section
            key={c.id}
            className={`rounded border bg-surface p-4 ${campaign === c.id ? "border-primary" : "border-border"}`}
          >
            <h2 className="font-medium">{c.name}</h2>
            {boards.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No boards yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {boards.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between py-2"
                  >
                    <Link
                      href={`/boards/${b.id}`}
                      className="text-link underline"
                    >
                      {b.name}
                    </Link>
                    <span className="flex items-center gap-4">
                      <span className="text-muted">
                        {b.nodeCount} cards · {b.updatedAt.toLocaleDateString()}
                      </span>
                      <form action={deleteBoardAction.bind(null, b.id)}>
                        <ConfirmButton
                          message={`Delete board "${b.name}"? Campaign records are not affected.`}
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={createBoardAction}
              className="mt-3 flex gap-2 text-sm"
            >
              <input type="hidden" name="campaignId" value={c.id} />
              <input
                name="name"
                required
                maxLength={120}
                placeholder="New board name"
                aria-label={`New board name for ${c.name}`}
                className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-1.5"
              />
              <button className="rounded bg-primary px-3 py-1.5 text-on-primary hover:bg-primary-hover">
                Create board
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
