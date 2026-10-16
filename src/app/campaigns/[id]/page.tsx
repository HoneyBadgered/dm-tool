import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/server/services/campaigns/campaigns";
import { deleteCampaignAction, updateCampaignAction } from "../actions";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/campaigns" className="text-sm text-muted hover:underline">
        ← Campaigns
      </Link>
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
              <button
                type="submit"
                className="rounded border border-red-700 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
