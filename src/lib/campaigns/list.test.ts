import { describe, expect, it } from "vitest";
import { filterCampaigns, sortCampaigns, type CampaignListItem } from "./list";

const items: CampaignListItem[] = [
  {
    id: "1",
    name: "beta",
    description: null,
    createdAt: "2024-01-02T00:00:00Z",
  },
  {
    id: "2",
    name: "Alpha",
    description: "Dragons of Doom",
    createdAt: "2024-01-03T00:00:00Z",
  },
  {
    id: "3",
    name: "Gamma",
    description: "",
    createdAt: "2024-01-01T00:00:00Z",
  },
];

describe("filterCampaigns", () => {
  it("returns all for blank query", () => {
    expect(filterCampaigns(items, "  ")).toHaveLength(3);
  });
  it("matches name case-insensitively", () => {
    expect(filterCampaigns(items, "BETA").map((c) => c.id)).toEqual(["1"]);
  });
  it("matches description and handles null", () => {
    expect(filterCampaigns(items, "dragon").map((c) => c.id)).toEqual(["2"]);
    expect(filterCampaigns(items, "null")).toEqual([]);
  });
  it("does not mutate input", () => {
    const copy = [...items];
    filterCampaigns(items, "a");
    expect(items).toEqual(copy);
  });
});

describe("sortCampaigns", () => {
  it("sorts by name ignoring case", () => {
    expect(sortCampaigns(items, "name", "asc").map((c) => c.name)).toEqual([
      "Alpha",
      "beta",
      "Gamma",
    ]);
    expect(sortCampaigns(items, "name", "desc").map((c) => c.name)).toEqual([
      "Gamma",
      "beta",
      "Alpha",
    ]);
  });
  it("sorts by created date", () => {
    expect(sortCampaigns(items, "createdAt", "asc").map((c) => c.id)).toEqual([
      "3",
      "1",
      "2",
    ]);
    expect(sortCampaigns(items, "createdAt", "desc").map((c) => c.id)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });
  it("does not mutate input", () => {
    const first = items[0];
    sortCampaigns(items, "name", "asc");
    expect(items[0]).toBe(first);
  });
});
