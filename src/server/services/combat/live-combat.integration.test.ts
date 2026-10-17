import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { addEncounterEntry } from "./encounter-entries";
import {
  addCombatant,
  addEffect,
  advanceTurn,
  applyDamageCommand,
  applyHealCommand,
  CombatConflictError,
  createAdHocCombat,
  createCombatFromEncounter,
  EncounterInCombatError,
  endCombat,
  getCombat,
  InvalidCombatStateError,
  removeCombatant,
  setCombatStatus,
  setInitiative,
  setVisibility,
  toViewerView,
  undoLast,
  type LiveCombatDb,
} from "./live-combat";

// Runs only against a throwaway database, never the working one.
const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("live combat (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (
      await prisma.campaign.create({ data: { name: "Integration campaign" } })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.$disconnect();
  });

  async function encounterWithLineup() {
    const encounter = await prisma.encounter.create({
      data: { campaignId, title: `Ambush ${Math.random()}` },
    });
    await addEncounterEntry(
      encounter.id,
      {
        kind: "custom",
        label: "Bandit",
        hpMode: "manual",
        quantity: 2,
        overrides: { maxHp: 11, armorClass: 12 },
      },
      db,
    );
    await addEncounterEntry(
      encounter.id,
      {
        kind: "custom",
        label: "Reinforcement",
        hpMode: "manual",
        wave: 1,
        overrides: { maxHp: 20, armorClass: 14 },
      },
      db,
    );
    return encounter;
  }

  it("creates a combat from an encounter with numbered combatants and wave 0 only", async () => {
    const encounter = await encounterWithLineup();
    const created = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    expect(created.combatantCount).toBe(2);
    const view = await getCombat(created.combatId, db);
    expect(view?.combatants.map((c) => c.name).sort()).toEqual([
      "Bandit 1",
      "Bandit 2",
    ]);
    expect(view?.status).toBe("setup");
    // Launching never changes the reusable template.
    expect(
      (await prisma.encounter.findUnique({ where: { id: encounter.id } }))
        ?.status,
    ).toBe("planned");
  });

  it("blocks a second open combat for the encounter", async () => {
    const encounter = await encounterWithLineup();
    await createCombatFromEncounter({ encounterId: encounter.id }, db);
    await expect(
      createCombatFromEncounter({ encounterId: encounter.id }, db),
    ).rejects.toBeInstanceOf(EncounterInCombatError);
  });

  it("database rejects a second unfinished combat for the same encounter", async () => {
    const encounter = await encounterWithLineup();
    await createCombatFromEncounter({ encounterId: encounter.id }, db);
    await expect(
      prisma.combat.create({
        data: { campaignId, encounterId: encounter.id },
      }),
    ).rejects.toThrow();
  });

  it("database CHECK constraints reject impossible HP", async () => {
    const { combatId } = await createAdHocCombat({ campaignId }, db);
    await expect(
      prisma.combatant.create({
        data: {
          combatId,
          kind: "custom",
          name: "Bad",
          side: "enemy",
          maxHp: 5,
          currentHp: 9,
          armorClass: 10,
          statSnapshot: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("runs a full round: start, turns, damage, heal, effects, and rejects stale versions", async () => {
    const { combatId, version } = await createAdHocCombat({ campaignId }, db);
    let v = version;
    const add = async (name: string, initiative: number) => {
      const r = await addCombatant(
        {
          combatId,
          expectedVersion: v,
          name,
          side: "enemy",
          maxHp: 10,
          armorClass: 12,
          initiative,
        },
        db,
      );
      v = r.version;
    };
    await add("Alpha", 18);
    await add("Beta", 9);

    await expect(
      advanceTurn({ combatId, expectedVersion: v, direction: "next" }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);

    v = (
      await setCombatStatus({ combatId, expectedVersion: v, to: "running" }, db)
    ).version;
    let view = await getCombat(combatId, db);
    const [alpha, beta] = view!.combatants;
    expect(alpha.name).toBe("Alpha");
    expect(view?.activeCombatantId).toBe(alpha.id);

    v = (
      await advanceTurn({ combatId, expectedVersion: v, direction: "next" }, db)
    ).version;
    view = await getCombat(combatId, db);
    expect(view?.activeCombatantId).toBe(beta.id);

    const damaged = await applyDamageCommand(
      { combatId, expectedVersion: v, combatantId: beta.id, amount: 14 },
      db,
    );
    v = damaged.version;
    view = await getCombat(combatId, db);
    expect(view?.combatants.find((c) => c.id === beta.id)?.currentHp).toBe(0);

    await expect(
      applyHealCommand(
        { combatId, expectedVersion: v - 1, combatantId: beta.id, amount: 2 },
        db,
      ),
    ).rejects.toBeInstanceOf(CombatConflictError);

    v = (
      await addEffect(
        {
          combatId,
          expectedVersion: v,
          targetId: beta.id,
          kind: "condition",
          name: "Prone",
        },
        db,
      )
    ).version;

    v = (await undoLast({ combatId, expectedVersion: v }, db)).version;
    view = await getCombat(combatId, db);
    expect(view?.effects).toHaveLength(0);
    expect(view?.combatants.find((c) => c.id === beta.id)?.currentHp).toBe(0);

    v = (await undoLast({ combatId, expectedVersion: v }, db)).version;
    view = await getCombat(combatId, db);
    expect(view?.combatants.find((c) => c.id === beta.id)?.currentHp).toBe(10);
  });

  it("idempotency keys replay instead of applying twice", async () => {
    const { combatId, version } = await createAdHocCombat({ campaignId }, db);
    const added = await addCombatant(
      {
        combatId,
        expectedVersion: version,
        name: "Solo",
        side: "enemy",
        maxHp: 10,
        armorClass: 10,
      },
      db,
    );
    const view = await getCombat(combatId, db);
    const target = view!.combatants[0].id;
    const cmd = {
      combatId,
      expectedVersion: added.version,
      combatantId: target,
      amount: 3,
      idempotencyKey: "retry-key-0001",
    };
    const first = await applyDamageCommand(cmd, db);
    const second = await applyDamageCommand(cmd, db);
    expect(second.replayed).toBe(true);
    expect(second.seq).toBe(first.seq);
    const after = await getCombat(combatId, db);
    expect(after?.combatants[0].currentHp).toBe(7);
  });

  it("soft-removes and hides combatants, and the viewer projection omits them", async () => {
    const { combatId, version } = await createAdHocCombat({ campaignId }, db);
    let v = version;
    for (const name of ["Visible", "Ambusher"]) {
      v = (
        await addCombatant(
          {
            combatId,
            expectedVersion: v,
            name,
            side: "enemy",
            maxHp: 10,
            armorClass: 10,
          },
          db,
        )
      ).version;
    }
    const view = await getCombat(combatId, db);
    const ambusher = view!.combatants.find((c) => c.name === "Ambusher")!;
    v = (
      await setVisibility(
        {
          combatId,
          expectedVersion: v,
          combatantId: ambusher.id,
          isHidden: true,
        },
        db,
      )
    ).version;
    const hidden = toViewerView((await getCombat(combatId, db))!);
    expect(hidden.combatants.map((c) => c.name)).toEqual(["Visible"]);

    await removeCombatant(
      { combatId, expectedVersion: v, combatantId: ambusher.id },
      db,
    );
    const row = await prisma.combatant.findUnique({
      where: { id: ambusher.id },
    });
    expect(row?.status).toBe("removed");
  });

  it("changing initiative reorders the turn order", async () => {
    const { combatId, version } = await createAdHocCombat({ campaignId }, db);
    let v = version;
    for (const [name, initiative] of [
      ["Slow", 5],
      ["Fast", 15],
    ] as const) {
      v = (
        await addCombatant(
          {
            combatId,
            expectedVersion: v,
            name,
            side: "party",
            maxHp: 10,
            armorClass: 10,
            initiative,
          },
          db,
        )
      ).version;
    }
    let view = await getCombat(combatId, db);
    const slow = view!.combatants.find((c) => c.name === "Slow")!;
    expect(view!.combatants[0].name).toBe("Fast");
    await setInitiative(
      { combatId, expectedVersion: v, combatantId: slow.id, initiative: 20 },
      db,
    );
    view = await getCombat(combatId, db);
    expect(view!.combatants[0].name).toBe("Slow");
  });

  it("ending a combat frees the encounter for another launch without changing its status", async () => {
    const encounter = await encounterWithLineup();
    const { combatId, version } = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    await endCombat({ combatId, expectedVersion: version }, db);
    expect(
      (await prisma.encounter.findUnique({ where: { id: encounter.id } }))
        ?.status,
    ).toBe("planned");
    const again = await createCombatFromEncounter(
      { encounterId: encounter.id },
      db,
    );
    expect(again.combatId).not.toBe(combatId);
  });
});
