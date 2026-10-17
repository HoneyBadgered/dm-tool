import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  addCombatant,
  advanceTurn,
  CombatConflictError,
  createAdHocCombat,
  getCombat,
  InvalidCombatStateError,
  moveInitiative,
  removeCombatant,
  restoreCombatant,
  rollInitiative,
  setActiveCombatant,
  setCombatStatus,
  setDefeated,
  setInitiative,
  undoLast,
  type LiveCombatDb,
} from "./live-combat";

// Runs only against a throwaway database, never the working one.
const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("initiative and turns (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "Init" } })).id;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  /** Ad hoc combat with the given [name, initiative] pairs, not yet started. */
  async function setup(entries: [string, number | null][]) {
    const created = await createAdHocCombat({ campaignId }, db);
    let version = created.version;
    for (const [name, initiative] of entries) {
      const r = await addCombatant(
        {
          combatId: created.combatId,
          expectedVersion: version,
          name,
          side: "enemy",
          maxHp: 10,
          armorClass: 10,
          initiative,
        },
        db,
      );
      version = r.version;
    }
    const combatId = created.combatId;
    const view = async () => (await getCombat(combatId, db))!;
    const idOf = async (name: string) =>
      (await view()).combatants.find((c) => c.name === name)!.id;
    const ver = async () => (await view()).version;
    const active = async () => {
      const v = await view();
      return {
        round: v.round,
        name: v.combatants.find((c) => c.id === v.activeCombatantId)?.name,
      };
    };
    const start = async (allowMissingInitiative = false) =>
      setCombatStatus(
        {
          combatId,
          expectedVersion: await ver(),
          to: "running",
          allowMissingInitiative,
        },
        db,
      );
    const next = async (direction: "next" | "previous" = "next") =>
      advanceTurn({ combatId, expectedVersion: await ver(), direction }, db);
    return { combatId, view, idOf, ver, active, start, next };
  }

  it("cannot start until everyone has initiative, unless the DM allows it", async () => {
    const t = await setup([
      ["A", 15],
      ["B", null],
    ]);
    await expect(t.start()).rejects.toBeInstanceOf(InvalidCombatStateError);
    await t.start(true);
    expect(await t.active()).toEqual({ round: 1, name: "A" });
    // The unrolled combatant acts last.
    await t.next();
    expect(await t.active()).toEqual({ round: 1, name: "B" });
  });

  it("walks the order, wraps into a new round, and goes back", async () => {
    const t = await setup([
      ["Low", 5],
      ["High", 20],
      ["Mid", 12],
    ]);
    await t.start();
    expect(await t.active()).toEqual({ round: 1, name: "High" });
    await t.next();
    await t.next();
    expect(await t.active()).toEqual({ round: 1, name: "Low" });
    await t.next();
    expect(await t.active()).toEqual({ round: 2, name: "High" });
    await t.next("previous");
    expect(await t.active()).toEqual({ round: 1, name: "Low" });
  });

  it("previous at the very start is rejected", async () => {
    const t = await setup([
      ["A", 10],
      ["B", 5],
    ]);
    await t.start();
    await expect(t.next("previous")).rejects.toBeInstanceOf(
      InvalidCombatStateError,
    );
    expect(await t.active()).toEqual({ round: 1, name: "A" });
  });

  it("a single combatant gets a new round on every turn", async () => {
    const t = await setup([["Solo", 10]]);
    await t.start();
    await t.next();
    await t.next();
    expect(await t.active()).toEqual({ round: 3, name: "Solo" });
    await t.next("previous");
    expect(await t.active()).toEqual({ round: 2, name: "Solo" });
  });

  it("orders ties by tie-break and lets the DM reorder them", async () => {
    const t = await setup([
      ["A", 10],
      ["B", 10],
      ["C", 10],
      ["D", 4],
    ]);
    const names = async () => {
      const v = await t.view();
      return v.turnOrder.map(
        (id) => v.combatants.find((c) => c.id === id)!.name,
      );
    };
    const before = await names();
    expect(before[3]).toBe("D");
    const second = before[1];

    await moveInitiative(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf(second),
        direction: "up",
      },
      db,
    );
    const after = await names();
    expect(after.slice(0, 2)).toEqual([second, before[0]]);
    expect(after[3]).toBe("D");

    // The top of a tie group cannot move up; the tie cannot cross a different initiative.
    await expect(
      moveInitiative(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantId: await t.idOf(after[0]),
          direction: "up",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await expect(
      moveInitiative(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantId: await t.idOf("D"),
          direction: "up",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);

    // The turn follows the manual order.
    await t.start();
    expect((await t.active()).name).toBe(after[0]);
    await undoLast(
      { combatId: t.combatId, expectedVersion: await t.ver() },
      db,
    ); // undoes the start
    await undoLast(
      { combatId: t.combatId, expectedVersion: await t.ver() },
      db,
    ); // undoes the manual move
    expect(await names()).toEqual(before);
  });

  it("editing initiative mid-combat keeps the same active combatant", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await t.start();
    await t.next();
    expect((await t.active()).name).toBe("B");
    await setInitiative(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("C"),
        initiative: 30,
      },
      db,
    );
    expect(await t.active()).toEqual({ round: 1, name: "B" });
    // C now sits before A, so after B the order wraps into round 2 with C first.
    await t.next();
    expect(await t.active()).toEqual({ round: 2, name: "C" });
  });

  it("rolls d20 plus modifier, keeps existing values unless overwriting, and is deterministic with a seeded rng", async () => {
    const t = await setup([
      ["Rolled", null],
      ["Fixed", 7],
    ]);
    const ids = [await t.idOf("Rolled"), await t.idOf("Fixed")];
    const r = await rollInitiative(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantIds: ids,
      },
      db,
      { rng: () => 0.5 },
    );
    expect(r.rolled).toEqual([{ id: ids[0], initiative: 11 }]);
    const v = await t.view();
    expect(v.combatants.find((c) => c.name === "Fixed")!.initiative).toBe(7);

    await expect(
      rollInitiative(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantIds: ids,
        },
        db,
        { rng: () => 0 },
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);

    await rollInitiative(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantIds: ids,
        overwrite: true,
      },
      db,
      { rng: () => 0.999 },
    );
    const after = await t.view();
    expect(after.combatants.map((c) => c.initiative)).toEqual([20, 20]);
  });

  it("skips defeated combatants and advances when the active one is defeated", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await t.start();
    await setDefeated(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("B"),
        defeated: true,
      },
      db,
    );
    await t.next();
    expect((await t.active()).name).toBe("C");

    await setDefeated(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("C"),
        defeated: true,
      },
      db,
    );
    // The active turn belonged to C, so it moved on; wrapping starts round 2.
    expect(await t.active()).toEqual({ round: 2, name: "A" });

    // Returning B keeps its place in the order and does not move the turn.
    await setDefeated(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("B"),
        defeated: false,
      },
      db,
    );
    expect(await t.active()).toEqual({ round: 2, name: "A" });
    await t.next();
    expect((await t.active()).name).toBe("B");
  });

  it("removing and restoring the active combatant never corrupts progression", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await t.start();
    await t.next();
    await removeCombatant(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("B"),
      },
      db,
    );
    expect(await t.active()).toEqual({ round: 1, name: "C" });
    await restoreCombatant(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("B"),
      },
      db,
    );
    expect(await t.active()).toEqual({ round: 1, name: "C" });
    await t.next();
    expect(await t.active()).toEqual({ round: 2, name: "A" });
    await t.next();
    expect((await t.active()).name).toBe("B");
  });

  it("combatants added mid-combat slot in without stealing the turn", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
    ]);
    await t.start();
    await t.next();
    await addCombatant(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        name: "Late",
        side: "enemy",
        maxHp: 5,
        armorClass: 10,
        initiative: 15,
      },
      db,
    );
    expect((await t.active()).name).toBe("B");
    await t.next();
    expect(await t.active()).toEqual({ round: 2, name: "A" });
    await t.next();
    expect((await t.active()).name).toBe("Late");
  });

  it("lets the DM hand the turn to any active combatant without changing the round", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await expect(
      setActiveCombatant(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantId: await t.idOf("C"),
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError); // not running yet
    await t.start();
    await setActiveCombatant(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("C"),
      },
      db,
    );
    expect(await t.active()).toEqual({ round: 1, name: "C" });
    await expect(
      setActiveCombatant(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantId: await t.idOf("C"),
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await setDefeated(
      {
        combatId: t.combatId,
        expectedVersion: await t.ver(),
        combatantId: await t.idOf("A"),
        defeated: true,
      },
      db,
    );
    await expect(
      setActiveCombatant(
        {
          combatId: t.combatId,
          expectedVersion: await t.ver(),
          combatantId: await t.idOf("A"),
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    // Defeating A is undoable; selecting C was the earlier event.
    await undoLast(
      { combatId: t.combatId, expectedVersion: await t.ver() },
      db,
    );
    await undoLast(
      { combatId: t.combatId, expectedVersion: await t.ver() },
      db,
    );
    expect(await t.active()).toEqual({ round: 1, name: "A" });
  });

  it("repeated or concurrent Next Turn requests advance exactly once", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await t.start();
    const version = await t.ver();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        advanceTurn(
          { combatId: t.combatId, expectedVersion: version, direction: "next" },
          db,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        CombatConflictError,
      );
    }
    expect(await t.active()).toEqual({ round: 1, name: "B" });
  });

  it("a double-clicked wrap increments the round once", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
    ]);
    await t.start();
    await t.next();
    const version = await t.ver();
    const twice = await Promise.allSettled([
      advanceTurn(
        { combatId: t.combatId, expectedVersion: version, direction: "next" },
        db,
      ),
      advanceTurn(
        { combatId: t.combatId, expectedVersion: version, direction: "next" },
        db,
      ),
    ]);
    expect(twice.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await t.active()).toEqual({ round: 2, name: "A" });
  });

  it("recovers the exact turn, round and initiative from the database after a refresh", async () => {
    const t = await setup([
      ["A", 20],
      ["B", 10],
      ["C", 5],
    ]);
    await t.start();
    await t.next();
    await t.next();
    await t.next();
    const fresh = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    try {
      const reloaded = (await getCombat(t.combatId, fresh))!;
      expect(reloaded.round).toBe(2);
      expect(reloaded.status).toBe("running");
      expect(
        reloaded.combatants.find((c) => c.id === reloaded.activeCombatantId)
          ?.name,
      ).toBe("A");
      expect(
        reloaded.combatants.map((c) => c.initiative).sort((a, b) => a! - b!),
      ).toEqual([5, 10, 20]);
    } finally {
      await fresh.$disconnect();
    }
  });
});
