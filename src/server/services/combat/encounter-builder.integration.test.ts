import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createEncounter,
  EncounterNotFoundError,
  getEncounter,
  updateEncounter,
} from "@/server/services/encounters/encounters";
import { CreatureTemplateNotFoundError } from "./creature-templates";
import {
  EncounterHasOpenCombatError,
  deleteEncounterTemplate,
  duplicateEncounter,
  getBuilderView,
  listCreatureOptions,
  listEncounterSummaries,
} from "./encounter-builder";
import {
  DuplicatePlayerEntryError,
  addEncounterEntry,
  duplicateEncounterEntry,
  listEncounterEntries,
  moveEncounterEntry,
  removeEncounterEntry,
  updateEncounterEntry,
} from "./encounter-entries";
import {
  InvalidCombatStateError,
  addWave,
  createCombatFromEncounter,
  endCombat,
  getCombat,
} from "./live-combat";

// Runs only against a throwaway database, never the working one.
const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("encounter builder (integration)", () => {
  let db: PrismaClient;
  let campaignId: string;
  let otherCampaignId: string;

  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    campaignId = (await db.campaign.create({ data: { name: "Builder" } })).id;
    otherCampaignId = (await db.campaign.create({ data: { name: "Other" } }))
      .id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.$disconnect();
  });

  const custom = (label: string, extra: Record<string, unknown> = {}) => ({
    kind: "custom",
    label,
    hpMode: "manual",
    overrides: { maxHp: 11, armorClass: 12 },
    ...extra,
  });

  async function newEncounter(title = "Bakery Ambush") {
    return createEncounter({ campaignId, title }, db);
  }

  it("creates, edits and lists an encounter with objective, notes and counts", async () => {
    const created = await createEncounter(
      {
        campaignId,
        title: "Bakery Ambush",
        notes: "Flour everywhere",
        objective: "Protect the baker",
      },
      db,
    );
    expect(created).toMatchObject({
      status: "planned",
      objective: "Protect the baker",
    });
    await addEncounterEntry(
      created.id,
      custom("Bakery Guard", { quantity: 3 }),
      db,
    );
    await addEncounterEntry(
      created.id,
      custom("Thug", { quantity: 2, wave: 1 }),
      db,
    );

    const edited = await updateEncounter(
      created.id,
      { title: "Bakery Ambush II", notes: null, objective: "" },
      db,
    );
    expect(edited).toMatchObject({
      title: "Bakery Ambush II",
      notes: null,
      objective: null,
    });
    expect(edited.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    );

    const summary = (await listEncounterSummaries(db)).find(
      (e) => e.id === created.id,
    );
    expect(summary).toMatchObject({
      combatantCount: 3,
      reinforcementCount: 2,
    });
  });

  it("rejects an over-long objective", async () => {
    await expect(
      createEncounter(
        { campaignId, title: "x", objective: "o".repeat(501) },
        db,
      ),
    ).rejects.toThrow();
  });

  it("adds, duplicates, reorders and removes entries", async () => {
    const encounter = await newEncounter();
    const a = await addEncounterEntry(encounter.id, custom("A"), db);
    const b = await addEncounterEntry(encounter.id, custom("B"), db);
    const copy = await duplicateEncounterEntry(a.id, db);
    expect(copy.label).toBe("A copy");

    const order = async () =>
      (await listEncounterEntries(encounter.id, db)).map((e) => e.label);
    expect(await order()).toEqual(["A", "A copy", "B"]);

    await moveEncounterEntry(b.id, "up", db);
    expect(await order()).toEqual(["A", "B", "A copy"]);
    await moveEncounterEntry(a.id, "up", db);
    expect(await order()).toEqual(["A", "B", "A copy"]);
    await moveEncounterEntry(copy.id, "down", db);
    expect(await order()).toEqual(["A", "B", "A copy"]);

    const edited = await updateEncounterEntry(
      b.id,
      {
        label: "Bakery Guard",
        quantity: 4,
        overrides: { maxHp: 20, armorClass: 14, notes: "Aproned" },
      },
      db,
    );
    expect(edited).toMatchObject({ label: "Bakery Guard", quantity: 4 });

    await removeEncounterEntry(copy.id, db);
    expect(await order()).toEqual(["A", "Bakery Guard"]);
  });

  it("validates entries: stats, limits, campaign scope and duplicate players", async () => {
    const encounter = await newEncounter();
    await expect(
      addEncounterEntry(
        encounter.id,
        { kind: "custom", label: "No stats", hpMode: "manual" },
        db,
      ),
    ).rejects.toThrow();
    await expect(
      addEncounterEntry(encounter.id, custom("Too many", { quantity: 51 }), db),
    ).rejects.toThrow();

    const foreignNpc = await db.npc.create({
      data: { campaignId: otherCampaignId, name: "Stranger" },
    });
    await expect(
      addEncounterEntry(
        encounter.id,
        { ...custom("Stranger"), kind: "npc", npcId: foreignNpc.id },
        db,
      ),
    ).rejects.toBeInstanceOf(CreatureTemplateNotFoundError);

    const pc = await db.playerCharacter.create({
      data: { campaignId, name: "Aria", maxHp: 30, armorClass: 16 },
    });
    const options = await listCreatureOptions(campaignId, db);
    expect(options.playerCharacters.map((p) => p.name)).toContain("Aria");
    const entry = await addEncounterEntry(
      encounter.id,
      {
        kind: "player_character",
        playerCharacterId: pc.id,
        label: "Aria",
        hpMode: "manual",
      },
      db,
    );
    await expect(
      addEncounterEntry(
        encounter.id,
        {
          kind: "player_character",
          playerCharacterId: pc.id,
          label: "Aria again",
          hpMode: "manual",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(DuplicatePlayerEntryError);
    await expect(duplicateEncounterEntry(entry.id, db)).rejects.toBeInstanceOf(
      DuplicatePlayerEntryError,
    );
  });

  it("adds a library monster when one has been imported", async (ctx) => {
    const monster = await db.ruleEntry.findFirst({
      where: { category: "monsters", isActive: true, origin: "imported" },
      select: { id: true, name: true },
    });
    if (!monster) return ctx.skip();
    const encounter = await newEncounter();
    const entry = await addEncounterEntry(
      encounter.id,
      {
        kind: "monster",
        ruleEntryId: monster.id,
        label: "Bakery Guard",
        quantity: 2,
      },
      db,
    );
    const view = await getBuilderView(encounter.id, db);
    expect(view.entries[0]).toMatchObject({
      id: entry.id,
      referenceName: monster.name,
      missing: false,
    });
    const launched = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    const combat = await getCombat(launched.combatId, db);
    expect(combat?.combatants.map((c) => c.name).sort()).toEqual([
      "Bakery Guard 1",
      "Bakery Guard 2",
    ]);
    expect(combat?.combatants[0].snapshot?.name).toBeTruthy();
  });

  it("duplicates an encounter without touching the original", async () => {
    const original = await createEncounter(
      { campaignId, title: "Original", objective: "Win" },
      db,
    );
    await addEncounterEntry(original.id, custom("One"), db);
    await addEncounterEntry(original.id, custom("Two", { wave: 1 }), db);
    const before = await listEncounterEntries(original.id, db);

    const copy = await duplicateEncounter(original.id, db);
    expect(copy.id).not.toBe(original.id);
    const copied = await getEncounter(copy.id, db);
    expect(copied).toMatchObject({
      title: "Original (copy)",
      objective: "Win",
      status: "planned",
    });
    const copiedEntries = await listEncounterEntries(copy.id, db);
    expect(copiedEntries.map((e) => [e.label, e.wave, e.sortOrder])).toEqual(
      before.map((e) => [e.label, e.wave, e.sortOrder]),
    );
    expect(copiedEntries.map((e) => e.id)).not.toContain(before[0].id);
    expect(await listEncounterEntries(original.id, db)).toEqual(before);

    await removeEncounterEntry(copiedEntries[0].id, db);
    expect(await listEncounterEntries(original.id, db)).toEqual(before);
    await expect(duplicateEncounter("missing", db)).rejects.toBeInstanceOf(
      EncounterNotFoundError,
    );
  });

  it("launch creates independent combatants and never mutates the template or other combats", async () => {
    const encounter = await newEncounter("Launch me");
    await addEncounterEntry(
      encounter.id,
      custom("Bakery Guard", { quantity: 2 }),
      db,
    );
    await addEncounterEntry(encounter.id, custom("Reserve", { wave: 1 }), db);
    const templateBefore = await listEncounterEntries(encounter.id, db);
    const encounterBefore = await getEncounter(encounter.id, db);

    const first = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    expect(first.combatantCount).toBe(2);
    expect(await listEncounterEntries(encounter.id, db)).toEqual(
      templateBefore,
    );
    expect(await getEncounter(encounter.id, db)).toEqual(encounterBefore);

    // A second encounter's combat runs independently.
    const sibling = await duplicateEncounter(encounter.id, db);
    const second = await createCombatFromEncounter(
      { encounterId: sibling.id },
      db,
    );
    expect(second.combatId).not.toBe(first.combatId);

    const runningBefore = await getCombat(first.combatId, db);
    expect(runningBefore?.combatants.map((c) => c.name)).toEqual([
      "Bakery Guard 1",
      "Bakery Guard 2",
    ]);

    // Edit the template heavily while the combat is open.
    const entries = await listEncounterEntries(encounter.id, db);
    await updateEncounterEntry(
      entries[0].id,
      {
        label: "Renamed",
        quantity: 9,
        overrides: { maxHp: 99, armorClass: 20 },
      },
      db,
    );
    await removeEncounterEntry(entries[1].id, db);
    await updateEncounter(encounter.id, { title: "Changed" }, db);

    const runningAfter = await getCombat(first.combatId, db);
    expect(runningAfter?.combatants).toEqual(runningBefore?.combatants);
    expect(runningAfter?.version).toBe(runningBefore?.version);
    const siblingCombat = await getCombat(second.combatId, db);
    expect(siblingCombat?.combatants.map((c) => c.maxHp)).toEqual([11, 11]);
  });

  it("holds reinforcements back until they are brought in", async () => {
    const encounter = await newEncounter("Reinforced");
    await addEncounterEntry(encounter.id, custom("Guard"), db);
    await addEncounterEntry(
      encounter.id,
      custom("Thug", { quantity: 2, wave: 1 }),
      db,
    );
    const launched = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    let view = await getCombat(launched.combatId, db);
    expect(view?.combatants).toHaveLength(1);

    await addWave(
      { combatId: launched.combatId, expectedVersion: view!.version, wave: 1 },
      db,
    );
    view = await getCombat(launched.combatId, db);
    expect(view?.combatants.map((c) => c.name).sort()).toEqual([
      "Guard",
      "Thug 1",
      "Thug 2",
    ]);
    expect(await listEncounterEntries(encounter.id, db)).toHaveLength(2);
  });

  it("refuses to launch an empty encounter or one with a missing creature", async () => {
    const empty = await newEncounter("Empty");
    await expect(
      createCombatFromEncounter({ encounterId: empty.id }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    expect(await db.combat.count({ where: { encounterId: empty.id } })).toBe(0);

    const encounter = await newEncounter("Missing creature");
    const npc = await db.npc.create({ data: { campaignId, name: "Baker" } });
    await addEncounterEntry(encounter.id, custom("Guard"), db);
    await addEncounterEntry(
      encounter.id,
      { ...custom("Baker"), kind: "npc", npcId: npc.id },
      db,
    );
    await db.npc.update({
      where: { id: npc.id },
      data: { deletedAt: new Date() },
    });

    const view = await getBuilderView(encounter.id, db);
    expect(view.entries.map((e) => e.missing)).toEqual([false, true]);
    await expect(
      createCombatFromEncounter({ encounterId: encounter.id }, db),
    ).rejects.toBeInstanceOf(CreatureTemplateNotFoundError);
    // The failed launch rolled back completely.
    expect(
      await db.combat.count({ where: { encounterId: encounter.id } }),
    ).toBe(0);
  });

  it("deletes an encounter only when no combat is open", async () => {
    const encounter = await newEncounter("Delete me");
    await addEncounterEntry(encounter.id, custom("Guard"), db);
    const launched = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    await expect(
      deleteEncounterTemplate(encounter.id, db),
    ).rejects.toBeInstanceOf(EncounterHasOpenCombatError);
    const view = await getCombat(launched.combatId, db);
    await endCombat(
      { combatId: launched.combatId, expectedVersion: view!.version },
      db,
    );

    await deleteEncounterTemplate(encounter.id, db);
    expect(await getEncounter(encounter.id, db)).toBeNull();
    expect((await listEncounterSummaries(db)).map((e) => e.id)).not.toContain(
      encounter.id,
    );
    // The finished combat keeps its history.
    expect((await getCombat(launched.combatId, db))?.combatants).toHaveLength(
      1,
    );
    await expect(
      deleteEncounterTemplate(encounter.id, db),
    ).rejects.toBeInstanceOf(EncounterNotFoundError);
    await expect(
      createCombatFromEncounter({ encounterId: encounter.id }, db),
    ).rejects.toBeInstanceOf(EncounterNotFoundError);
  });
});
