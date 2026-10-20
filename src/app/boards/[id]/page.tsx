import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getBoard } from "@/server/services/story/boards";
import { renameBoardAction } from "../actions";
import { BoardCanvas } from "./board-canvas";

export default function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="h-96 animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading board"
        />
      }
    >
      <Board params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await io();
  const { id } = await params;
  const { notice } = await searchParams;
  const board = await getBoard(id);
  if (!board) notFound();

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/boards"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Boards
        </Link>
        <form
          action={renameBoardAction.bind(null, board.id)}
          className="flex gap-2"
        >
          <input
            name="name"
            defaultValue={board.name}
            required
            maxLength={120}
            aria-label="Board name"
            className="rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold hover:border-border"
          />
          <button className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm hover:bg-black/5">
            Rename
          </button>
        </form>
        {notice === "invalid" ? (
          <span role="alert" className="text-sm text-red-700">
            Could not rename.
          </span>
        ) : null}
        <Link
          href={`/campaigns/${board.campaignId}/records`}
          className="ml-auto rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-forest hover:bg-black/5"
        >
          Manage records
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <BoardCanvas board={board} />
      </div>
    </div>
  );
}
