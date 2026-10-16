import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";
import { Notice } from "./notice";
import { CampaignList } from "./campaign-list";
import { listCampaigns } from "@/server/services/campaigns/campaigns";

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
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
      <Suspense fallback={<CampaignsSkeleton />}>
        <CampaignsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function CampaignsSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading campaigns">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-16 animate-pulse rounded border border-border bg-surface"
        />
      ))}
    </ul>
  );
}

async function CampaignsContent({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await io();
  const { notice } = await searchParams;
  const campaigns = await listCampaigns();
  return (
    <>
      <Notice notice={notice} />
      <CampaignList
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
