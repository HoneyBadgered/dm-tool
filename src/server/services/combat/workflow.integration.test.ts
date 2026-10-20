import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createEncounter,
  getEncounter,
} from "@/server/services/encounters/encounters";
import { addEncounterEntry, listEncounterEntries } from "./encounter-entries";
import {
  addEffect,
  addWave,
  advanceTurn,
  applyDamageCommand,
  createCombatFromEncounter,
  endCombat,
  getCombat,
  listCombatEvents,
  rollInitiative,
  setCombatStatus,
  setDefeated,
  setInitiative,
  setVisibility,
  toViewerEvents,
  toViewerView,
  undoLast,
} from "./live-combat";
import { makeRollRecord } from "./resolution";
import { confirmResolution } from "./resolve-service";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("encounter to end of combat (integration)", () => {
  let prisma: PrismaClient;
  let db: PrismaClient;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "Workflow" } }))
      .id;
  });
  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("runs a whole session consistently without touching the template", async () => {
    const encounter = await createEncounter(
      { campaignId, title: "Full run", notes: "n", objective: "o" },
      db,
    );
    const custom = (label: string, extra: Record<string, unknown> = {}) => ({
      kind: "custom",
      label,
      hpMode: "manual",
      overrides: { maxHp: 20, armorClass: 12 },
      ...extra,
    });
    await addEncounterEntry(encounter.id, custom("Guard", { quantity: 2 }), db);
    await addEncounterEntry(encounter.id, custom("Ambusher", { wave: 1 }), db);
    const templateBefore = await listEncounterEntries(encounter.id, db);
    const encounterBefore = await getEncounter(encounter.id, db);

    const launched = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    const id = launched.combatId;
    const view = async () => (await getCombat(id, db))!;
    const v = async () => (await view()).version;

    await rollInitiative(
      {
        combatId: id,
        expectedVersion: await v(),
        combatantIds: (await view()).combatants.map((c) => c.id),
      },
      db,
    );
    await setCombatStatus(
      { combatId: id, expectedVersion: await v(), to: "running" },
      db,
    );
    // Reinforcements mid-combat get initiative and join the order.
    await addWave({ combatId: id, expectedVersion: await v(), wave: 1 }, db);
    const ambusher = (await view()).combatants.find(
      (c) => c.name === "Ambusher",
    )!;
    await setInitiative(
      {
        combatId: id,
        expectedVersion: await v(),
        combatantId: ambusher.id,
        initiative: 30,
      },
      db,
    );
    await setVisibility(
      {
        combatId: id,
        expectedVersion: await v(),
        combatantId: ambusher.id,
        isHidden: true,
      },
      db,
    );

    const [g1, g2] = (await view()).combatants.filter((c) =>
      c.name.startsWith("Guard"),
    );
    await addEffect(
      {
        combatId: id,
        expectedVersion: await v(),
        targetId: g1.id,
        kind: "ongoing",
        name: "Marked",
        note: "Marked by the guard",
        expiryTrigger: "none",
      },
      db,
    );
    // A dice roll confirmed with an override.
    const record = makeRollRecord({
      kind: "attack",
      actorId: ambusher.id,
      targetId: g1.id,
      label: "Stab",
      bonus: 5,
      mode: "normal",
      dc: null,
      halfOnSuccess: false,
      manualD20: [15],
      damage: [{ expr: "1d4+2", type: "piercing", manual: [3] }],
    });
    await confirmResolution(
      {
        combatId: id,
        expectedVersion: await v(),
        record,
        overrides: { final: 4 },
      },
      db,
    );
    expect(
      (await view()).combatants.find((c) => c.id === g1.id)!.currentHp,
    ).toBe(16);
    await undoLast({ combatId: id, expectedVersion: await v() }, db);
    expect(
      (await view()).combatants.find((c) => c.id === g1.id)!.currentHp,
    ).toBe(20);

    await applyDamageCommand(
      {
        combatId: id,
        expectedVersion: await v(),
        combatantId: g2.id,
        amount: 50,
      },
      db,
    );
    await setDefeated(
      {
        combatId: id,
        expectedVersion: await v(),
        combatantId: g2.id,
        defeated: true,
      },
      db,
    );
    // A full lap of turns stays consistent: round only ever goes up.
    let last = (await view()).round;
    for (let i = 0; i < 6; i++) {
      await advanceTurn(
        { combatId: id, expectedVersion: await v(), direction: "next" },
        db,
      );
      const now = await view();
      expect(now.round).toBeGreaterThanOrEqual(last);
      expect(now.turnOrder).toContain(now.activeCombatantId);
      expect(
        now.combatants.find((c) => c.id === now.activeCombatantId)!.status,
      ).toBe("active");
      last = now.round;
    }

    // Hidden combatants never reach the viewer projection or viewer log.
    const full = await view();
    const viewer = toViewerView(full);
    expect(viewer.combatants.map((c) => c.name)).not.toContain("Ambusher");
    const events = await listCombatEvents(id, { limit: 500 }, db);
    const safeEvents = toViewerEvents(events, full);
    expect(JSON.stringify(safeEvents)).not.toContain("Ambusher");
    expect(JSON.stringify(safeEvents)).not.toContain("Stab");
    expect(JSON.stringify(viewer)).not.toContain("Ambusher");

    await endCombat({ combatId: id, expectedVersion: await v() }, db);
    expect((await view()).status).toBe("ended");

    // Template untouched by the whole session.
    expect(await listEncounterEntries(encounter.id, db)).toEqual(
      templateBefore,
    );
    expect(await getEncounter(encounter.id, db)).toEqual(encounterBefore);
    // History survives, ordered and complete.
    const all = await listCombatEvents(id, { limit: 500 }, db);
    expect(all[0].type).toBe("combat_ended");
    expect(all.some((e) => e.type === "undo")).toBe(true);
    expect(all.some((e) => e.origin === "override")).toBe(true);
  });
});
