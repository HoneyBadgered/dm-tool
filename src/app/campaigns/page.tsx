import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { listCampaigns } from "@/server/services/campaigns/campaigns";

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="rounded bg-forest px-3 py-1.5 text-sm text-white hover:bg-forest-dark"
        >
          New campaign
        </Link>
      </div>
      <Suspense
        fallback={<p className="text-sm text-muted">Loading campaigns...</p>}
      >
        <CampaignList />
      </Suspense>
    </div>
  );
}

async function CampaignList() {
  await io();
  const campaigns = await listCampaigns();
  return campaigns.length === 0 ? (
    <p className="text-sm text-muted">No campaigns yet.</p>
  ) : (
    <ul className="space-y-2">
      {campaigns.map((c) => (
        <li key={c.id}>
          <Link
            href={`/campaigns/${c.id}`}
            className="block rounded border border-border bg-surface p-4 hover:border-forest"
          >
            <div className="font-semibold text-forest">{c.name}</div>
            {c.description && (
              <div className="mt-1 line-clamp-2 text-sm text-muted">
                {c.description}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
