import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { createNpcAction } from "../actions";
import { NpcForm } from "../npc-form";

export default function NewNpcPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">New NPC</h1>
      <Suspense
        fallback={
          <div
            className="h-40 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
          />
        }
      >
        <NewNpcForm />
      </Suspense>
    </div>
  );
}

async function NewNpcForm() {
  await io();
  const campaigns = await listCampaigns();
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted">
        NPCs belong to a campaign.{" "}
        <Link href="/campaigns/new" className="underline">
          Create a campaign
        </Link>{" "}
        first.
      </p>
    );
  }
  return (
    <NpcForm
      action={createNpcAction}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      submitLabel="Create"
      cancelHref="/npcs"
    />
  );
}
