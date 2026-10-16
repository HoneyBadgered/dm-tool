import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { createEncounterAction } from "../actions";
import { EncounterForm } from "../encounter-form";

export default function NewEncounterPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">New encounter</h1>
      <Suspense
        fallback={
          <div
            className="h-40 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
          />
        }
      >
        <NewEncounterForm />
      </Suspense>
    </div>
  );
}

async function NewEncounterForm() {
  await io();
  const campaigns = await listCampaigns();
  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted">
        Encounters belong to a campaign.{" "}
        <Link href="/campaigns/new" className="underline">
          Create a campaign
        </Link>{" "}
        first.
      </p>
    );
  }
  return (
    <EncounterForm
      action={createEncounterAction}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      submitLabel="Create"
      cancelHref="/encounters"
    />
  );
}
