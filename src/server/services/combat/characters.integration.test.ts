import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
} from "@/server/services/campaigns/characters";
import { createEncounter } from "@/server/services/encounters/encounters";
import { addEncounterEntry } from "./encounter-entries";
import {
  addPlayerCharacter,
  createCombatFromEncounter,
  getCombat,
  setInitiative,
  undoLast,
} from "./live-combat";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("player characters (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let otherCampaignId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "Party" } })).id;
    otherCampaignId = (await db.campaign.create({ data: { name: "Other" } }))
      .id;
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  const pc = (extra: Record<string, unknown> = {}) => ({
    campaignId,
    name: "Mira",
    playerName: "Sam",
    race: "Dwarf",
    characterClass: "Cleric",
    level: 3,
    backstory: "Raised in the deep halls.\n\nLong story follows.",
    maxHp: 24,
    armorClass: 16,
    initiativeModifier: 1,
    speed: "30 ft.",
    passivePerception: 14,
    abilityScores: [
      { label: "WIS", value: 16 },
      { label: "STR", value: 10 },
    ],
    notes: "Resistant to necrotic",
    ...extra,
  });

  async function launch() {
    const encounter = await createEncounter({ campaignId, title: "Fight" }, db);
    await addEncounterEntry(
      encounter.id,
      {
        kind: "custom",
        label: "Goblin",
        hpMode: "manual",
        overrides: { maxHp: 7, armorClass: 13 },
      },
      db,
    );
    const { combatId } = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    return combatId;
  }

  it("creates, edits, validates and soft-deletes characters", async () => {
    const created = await createCharacter(pc(), db);
    expect(created.abilityScores).toHaveLength(2);
    expect(created).toMatchObject({
      race: "Dwarf",
      characterClass: "Cleric",
      level: 3,
    });
    expect(created.backstory).toContain("Long story follows.");
    await expect(createCharacter(pc({ level: 21 }), db)).rejects.toThrow();
    await expect(createCharacter(pc({ maxHp: 0 }), db)).rejects.toThrow();
    await expect(
      createCharacter(pc({ campaignId: "nope" }), db),
    ).rejects.toThrow();

    const edited = await updateCharacter(
      created.id,
      { ...pc(), name: "Mira II", abilityScores: [], notes: null },
      db,
    );
    expect(edited.name).toBe("Mira II");
    expect(edited.abilityScores).toEqual([]);
    expect(edited.notes).toBeNull();
    expect(edited.backstory).toContain("deep halls");

    expect((await listCharacters(campaignId, db)).map((c) => c.id)).toContain(
      created.id,
    );
    await deleteCharacter(created.id, db);
    expect(await getCharacter(created.id, db)).toBeNull();
    expect(
      (await listCharacters(campaignId, db)).map((c) => c.id),
    ).not.toContain(created.id);
  });

  it("adds a character mid-combat with stats, notes and manual initiative", async () => {
    const character = await createCharacter(pc({ name: "Tor" }), db);
    const combatId = await launch();
    let view = (await getCombat(combatId, db))!;
    await addPlayerCharacter(
      {
        combatId,
        expectedVersion: view.version,
        playerCharacterId: character.id,
        initiative: 17,
      },
      db,
    );
    view = (await getCombat(combatId, db))!;
    const added = view.combatants.find((c) => c.name === "Tor")!;
    expect(added).toMatchObject({
      kind: "player_character",
      side: "party",
      initiative: 17,
      maxHp: 24,
      currentHp: 24,
      armorClass: 16,
      notes: "Resistant to necrotic",
      sourcePlayerCharacterId: character.id,
    });
    expect(added.snapshot?.speed).toEqual(["30 ft."]);
    expect(JSON.stringify(added.snapshot?.sections)).toContain(
      "Dwarf · Cleric · Level 3",
    );
    // The long backstory stays out of the live combatant.
    expect(JSON.stringify(added)).not.toContain("deep halls");
    expect(added.snapshot?.senses).toEqual(["Passive Perception 14"]);
    expect(added.snapshot?.abilityScores).toContainEqual({
      label: "WIS",
      value: 16,
    });

    // Adding twice is refused.
    await expect(
      addPlayerCharacter(
        {
          combatId,
          expectedVersion: view.version,
          playerCharacterId: character.id,
        },
        db,
      ),
    ).rejects.toThrow(/already in this combat/);

    // Initiative can be typed afterwards, and library edits don't touch the live copy.
    await setInitiative(
      {
        combatId,
        expectedVersion: view.version,
        combatantId: added.id,
        initiative: 5,
      },
      db,
    );
    await updateCharacter(
      character.id,
      { ...pc({ name: "Tor" }), maxHp: 99, notes: "changed" },
      db,
    );
    view = (await getCombat(combatId, db))!;
    const after = view.combatants.find((c) => c.id === added.id)!;
    expect(after).toMatchObject({ initiative: 5, maxHp: 24 });
    expect(after.notes).toBe("Resistant to necrotic");

    await undoLast({ combatId, expectedVersion: view.version }, db);
  });

  it("refuses characters from another campaign", async () => {
    const outsider = await createCharacter(
      pc({ campaignId: otherCampaignId, name: "Outsider" }),
      db,
    );
    const combatId = await launch();
    const view = (await getCombat(combatId, db))!;
    await expect(
      addPlayerCharacter(
        {
          combatId,
          expectedVersion: view.version,
          playerCharacterId: outsider.id,
        },
        db,
      ),
    ).rejects.toThrow();
  });

  it("copies character stats and notes when launching an encounter", async () => {
    const character = await createCharacter(pc({ name: "Launchy" }), db);
    const encounter = await createEncounter(
      { campaignId, title: "With party" },
      db,
    );
    await addEncounterEntry(
      encounter.id,
      {
        kind: "player_character",
        label: "Launchy",
        hpMode: "manual",
        playerCharacterId: character.id,
      },
      db,
    );
    const { combatId } = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    const view = (await getCombat(combatId, db))!;
    const c = view.combatants.find((x) => x.name === "Launchy")!;
    expect(c.notes).toBe("Resistant to necrotic");
    expect(c.initiative).toBeNull();
    expect(c.snapshot?.abilityScores).toHaveLength(2);
  });
});

describe.skipIf(!safe)("npc race, class and level (integration)", () => {
  it("stores them as separate fields", async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    try {
      const { createNpc, updateNpc } =
        await import("@/server/services/npcs/npcs");
      const campaign = await db.campaign.create({ data: { name: "NPC camp" } });
      const npc = await createNpc(
        {
          campaignId: campaign.id,
          name: "Idris",
          race: "Human",
          characterClass: "Fighter",
          level: 5,
        },
        db,
      );
      expect(npc).toMatchObject({
        race: "Human",
        characterClass: "Fighter",
        level: 5,
      });
      await expect(
        updateNpc(npc.id, { name: "Idris", level: 0 }, db),
      ).rejects.toThrow();
      const cleared = await updateNpc(npc.id, { name: "Idris" }, db);
      expect(cleared.level).toBeNull();
    } finally {
      await db.$disconnect();
    }
  });
});
