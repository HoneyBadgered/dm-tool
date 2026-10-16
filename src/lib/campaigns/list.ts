export type CampaignListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export type SortKey = "name" | "createdAt";
export type SortDirection = "asc" | "desc";

export function filterCampaigns<
  T extends Pick<CampaignListItem, "name" | "description">,
>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q),
  );
}

export function sortCampaigns<
  T extends Pick<CampaignListItem, "name" | "createdAt">,
>(items: readonly T[], key: SortKey, direction: SortDirection): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const cmp =
      key === "name"
        ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        : Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return cmp * factor;
  });
}
