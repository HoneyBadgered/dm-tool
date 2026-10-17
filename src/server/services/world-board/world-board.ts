import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";

export type WorldBoardNpc = {
  id: string;
  name: string;
  role: string | null;
  location: string | null;
  notes: string | null;
};

export type WorldBoardCampaign = {
  id: string;
  name: string;
  description: string | null;
  npcs: WorldBoardNpc[];
};

export type WorldBoardDb = Pick<PrismaClient, "campaign">;

export async function getWorldBoard(
  query = "",
  db: WorldBoardDb = getDb(),
): Promise<WorldBoardCampaign[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length > 100) {
    throw new RangeError("World search must be 100 characters or fewer.");
  }

  const campaigns = await db.campaign.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      npcs: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          location: true,
          notes: true,
        },
      },
    },
  });

  if (!normalizedQuery) return campaigns;
  const term = normalizedQuery.toLocaleLowerCase();
  return campaigns.flatMap((campaign) => {
    const matchesCampaign = [campaign.name, campaign.description ?? ""].some(
      (value) => value.toLocaleLowerCase().includes(term),
    );
    const matchingNpcs = campaign.npcs.filter((npc) =>
      [npc.name, npc.role ?? "", npc.location ?? "", npc.notes ?? ""].some(
        (value) => value.toLocaleLowerCase().includes(term),
      ),
    );
    if (!matchesCampaign && matchingNpcs.length === 0) return [];
    return [
      {
        ...campaign,
        npcs: matchesCampaign ? campaign.npcs : matchingNpcs,
      },
    ];
  });
}
