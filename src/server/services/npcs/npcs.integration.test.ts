import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { NpcReferenceNotFoundError, createNpc, getNpc } from "./npcs";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe("NPC profile persistence (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let foreignCampaignId: string;

  beforeAll(async () => {
    if (!safe) return;
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const campaign = await db.campaign.create({
      data: { name: "NPC profile integration" },
      select: { id: true },
    });
    campaignId = campaign.id;
    const foreign = await db.campaign.create({
      data: { name: "NPC profile foreign campaign" },
      select: { id: true },
    });
    foreignCampaignId = foreign.id;
  });

  afterAll(async () => {
    if (!safe || !db) return;
    await db.campaign.deleteMany({
      where: { id: { in: [campaignId, foreignCampaignId] } },
    });
    await db.$disconnect();
  });

  it.runIf(safe)(
    "stores optional profile fields and campaign-scoped location/faction links",
    async () => {
      const location = await db.storyRecord.create({
        data: { campaignId, kind: "location", name: "Harbor Ward" },
        select: { id: true },
      });
      const faction = await db.storyRecord.create({
        data: { campaignId, kind: "faction", name: "Lantern Circle" },
        select: { id: true },
      });
      const npc = await createNpc(
        {
          campaignId,
          name: "Mira Vale",
          titleAlias: "The Lantern",
          status: "missing",
          level: 6,
          challengeRating: "1/2",
          locationRecordId: location.id,
          factionRecordId: faction.id,
          quickSummary: "A careful informant who wants the city safe.",
          motivation: "Protect the ward",
          goals: "Find the missing courier",
          currentPlans: "Question the dockmaster",
          secret: "She has the letter",
          partyRelationship: "suspicious",
          initiativeCombatNotes: "Avoids the front line.",
          firstAppearance: "Session 2",
          lastSeen: "Session 5",
          dmNotes: "May become an ally",
          relationshipNotes: "Knows the dockmaster",
          portraitUrl: "https://example.invalid/mira.png",
        },
        db,
      );

      expect(await getNpc(npc.id, db)).toMatchObject({
        titleAlias: "The Lantern",
        status: "missing",
        level: 6,
        challengeRating: "1/2",
        location: "Harbor Ward",
        locationRecordId: location.id,
        faction: "Lantern Circle",
        factionRecordId: faction.id,
        quickSummary: "A careful informant who wants the city safe.",
        motivation: "Protect the ward",
        goals: "Find the missing courier",
        currentPlans: "Question the dockmaster",
        secret: "She has the letter",
        partyRelationship: "suspicious",
        dmNotes: "May become an ally",
      });
    },
  );

  it.runIf(safe)(
    "rejects location and faction links from another campaign",
    async () => {
      const foreignLocation = await db.storyRecord.create({
        data: {
          campaignId: foreignCampaignId,
          kind: "location",
          name: "Foreign place",
        },
        select: { id: true },
      });
      await expect(
        createNpc(
          {
            campaignId,
            name: "Invalid link",
            locationRecordId: foreignLocation.id,
          },
          db,
        ),
      ).rejects.toBeInstanceOf(NpcReferenceNotFoundError);
    },
  );
});
