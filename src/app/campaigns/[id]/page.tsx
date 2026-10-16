import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCampaign } from "@/server/services/campaigns/campaigns";
import { deleteCampaignAction, updateCampaignAction } from "../actions";
import { CampaignForm } from "../campaign-form";
import { DeleteButton } from "../delete-button";
import { Notice } from "../notice";

export default function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-40 max-w-xl animate-pulse rounded border border-border bg-surface"
          aria-busy="true"
          aria-label="Loading campaign"
        />
      }
    >
      <CampaignDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CampaignDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  await io();
  const { id } = await params;
  const { edit, notice } = await searchParams;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/campaigns" className="text-sm text-muted hover:underline">
        ← Campaigns
      </Link>
      <div className="mt-4">
        <Notice notice={notice} />
      </div>
      {edit !== undefined ? (
        <>
          <h1 className="my-4 text-xl font-semibold">Edit campaign</h1>
          <CampaignForm
            action={updateCampaignAction.bind(null, campaign.id)}
            initial={campaign}
            submitLabel="Save"
            cancelHref={`/campaigns/${campaign.id}`}
          />
        </>
      ) : (
        <>
          <h1 className="my-4 text-xl font-semibold">{campaign.name}</h1>
          <p className="whitespace-pre-wrap text-sm text-muted">
            {campaign.description ?? "No description."}
          </p>
          <div className="mt-6 flex gap-2">
            <Link
              href={`/campaigns/${campaign.id}?edit`}
              className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
            >
              Edit
            </Link>
            <form action={deleteCampaignAction.bind(null, campaign.id)}>
              <DeleteButton />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
