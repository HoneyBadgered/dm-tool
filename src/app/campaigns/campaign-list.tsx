"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  filterCampaigns,
  sortCampaigns,
  type CampaignListItem,
  type SortDirection,
  type SortKey,
} from "@/lib/campaigns/list";

export function CampaignList({ campaigns }: { campaigns: CampaignListItem[] }) {
  const [query, setQuery] = useState("");
  const [key, setKey] = useState<SortKey>("createdAt");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const visible = useMemo(
    () => sortCampaigns(filterCampaigns(campaigns, query), key, direction),
    [campaigns, query, key, direction],
  );

  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted">
        No campaigns yet. Create your first campaign to get started.
      </p>
    );
  }

  const field = "rounded border border-border bg-surface px-3 py-1.5 text-sm";
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="grow text-sm">
          <span className="sr-only">Search campaigns</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or description"
            className={`${field} w-full`}
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Sort by</span>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value as SortKey)}
            className={field}
          >
            <option value="createdAt">Created date</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Sort direction</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as SortDirection)}
            className={field}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <p className="sr-only" role="status">
        {visible.length} of {campaigns.length} campaigns shown
      </p>
      {visible.length === 0 ? (
        <p className="text-sm text-muted">
          No campaigns match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => (
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
      )}
    </div>
  );
}
