import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { redirectToSlugUrl, resolveSlugParam } from "@/server/services/slugs";
import { Suspense } from "react";
import { getCampaign } from "@/server/services/campaigns/campaigns";
import { deleteCampaignAction, updateCampaignAction } from "../actions";
import { CampaignForm } from "../campaign-form";
import { DeleteButton } from "../delete-button";
import { Notice } from "../notice";
import { Characters } from "./characters";
import { listCharacters } from "@/server/services/campaigns/characters";

export default function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    edit?: string;
    notice?: string;
    editCharacter?: string;
    backstory?: string;
  }>;
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
  searchParams: Promise<{
    edit?: string;
    notice?: string;
    editCharacter?: string;
    backstory?: string;
  }>;
}) {
  await io();
  const { id: param } = await params;
  const sp = await searchParams;
  const { edit, notice, editCharacter, backstory } = sp;
  const campaign = await getCampaign(await resolveSlugParam("campaign", param));
  if (!campaign) notFound();
  await redirectToSlugUrl({
    kind: "campaign",
    param,
    entity: campaign,
    path: (slug) => `/campaigns/${slug}`,
    search: sp,
  });

  return (
    <div className="mx-auto max-w-3xl">
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
              className="rounded bg-primary px-4 py-2 text-sm text-on-primary hover:bg-primary-hover"
            >
              Edit
            </Link>
            <form action={deleteCampaignAction.bind(null, campaign.id)}>
              <DeleteButton />
            </form>
          </div>
          <p className="mt-4 flex gap-4 text-sm">
            <Link
              href={`/campaigns/${campaign.id}/records`}
              className="text-link underline"
            >
              Factions, locations, quests, clues &amp; events
            </Link>
            <Link
              href={`/boards?campaign=${campaign.id}`}
              className="text-link underline"
            >
              Story boards
            </Link>
          </p>
          <Characters
            campaignId={campaign.id}
            characters={await listCharacters(campaign.id)}
            editId={editCharacter}
            backstoryId={backstory}
          />
        </>
      )}
    </div>
  );
}
