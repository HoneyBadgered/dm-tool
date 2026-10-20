import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import {
  CombatConflictError,
  InvalidCombatStateError,
  UndoConflictError,
  addCombatant,
  advanceTurn,
  applyDamageCommand,
  createAdHocCombat,
  endCombat,
  eventOrigin,
  getCombat,
  listCombatEvents,
  listRecentEndedCombats,
  setCombatStatus,
  setInitiative,
  undoLast,
  type LiveCombatDb,
} from "./live-combat";
import { makeRollRecord } from "./resolution";
import { confirmResolution } from "./resolve-service";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe("eventOrigin", () => {
  it("tells calculated, manual and overridden results apart", () => {
    expect(eventOrigin("damage", { overridden: true })).toBe("override");
    expect(eventOrigin("damage", {})).toBe("manual");
    expect(eventOrigin("heal", {})).toBe("manual");
    expect(eventOrigin("initiative_set", { rolled: [] })).toBe("calculated");
    expect(eventOrigin("initiative_set", { initiative: 3 })).toBe("manual");
    expect(eventOrigin("turn_changed", {})).toBeNull();
    const roll = {
      kind: "attack",
      label: "x",
      natural: 10,
      bonus: 1,
      total: 11,
      against: "AC 10",
      verdict: "hit",
      manualDice: false,
      overrides: [],
    };
    expect(eventOrigin("damage", { roll })).toBe("calculated");
    expect(
      eventOrigin("damage", {
        roll: { ...roll, overrides: ["total overridden"] },
      }),
    ).toBe("override");
    expect(eventOrigin("note", { roll })).toBe("calculated");
    expect(eventOrigin("note", {})).toBeNull();
  });
});

describe.skipIf(!safe)("history, recovery and duplicates (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "History" } }))
      .id;
  });
  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function setup() {
    const created = await createAdHocCombat({ campaignId }, db);
    const combatId = created.combatId;
    const view = async () => (await getCombat(combatId, db))!;
    for (const name of ["A", "B"]) {
      await addCombatant(
        {
          combatId,
          expectedVersion: (await view()).version,
          name,
          side: name === "A" ? "enemy" : "party",
          maxHp: 20,
          armorClass: 12,
        },
        db,
      );
    }
    const [a, b] = (await view()).combatants;
    const ids = { a: a.id, b: b.id };
    for (const [i, id] of [ids.a, ids.b].entries())
      await setInitiative(
        {
          combatId,
          expectedVersion: (await view()).version,
          combatantId: id,
          initiative: 15 - i,
        },
        db,
      );
    await setCombatStatus(
      { combatId, expectedVersion: (await view()).version, to: "running" },
      db,
    );
    return { combatId, view, ids };
  }

  const hpOf = async (t: Awaited<ReturnType<typeof setup>>, id: string) =>
    (await t.view()).combatants.find((c) => c.id === id)!.currentHp;

  it("recovers the same state from a fresh client after a restart", async () => {
    const t = await setup();
    await applyDamageCommand(
      {
        combatId: t.combatId,
        expectedVersion: (await t.view()).version,
        combatantId: t.ids.b,
        amount: 6,
      },
      db,
    );
    const before = await t.view();
    const fresh = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    try {
      const after = (await getCombat(t.combatId, fresh))!;
      expect(after.version).toBe(before.version);
      expect(after.round).toBe(before.round);
      expect(after.activeCombatantId).toBe(before.activeCombatantId);
      expect(
        after.combatants.map((c) => [c.id, c.currentHp, c.initiative]),
      ).toEqual(
        before.combatants.map((c) => [c.id, c.currentHp, c.initiative]),
      );
      expect(after.status).toBe("running");
    } finally {
      await fresh.$disconnect();
    }
  });

  it("orders events by strictly increasing seq with timestamps", async () => {
    const t = await setup();
    await advanceTurn(
      {
        combatId: t.combatId,
        expectedVersion: (await t.view()).version,
        direction: "next",
      },
      db,
    );
    const events = await listCombatEvents(t.combatId, {}, db);
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => y - x));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(events[0].type).toBe("turn_changed");
    expect(events[events.length - 1].type).toBe("combat_created");
    expect(events.every((e) => e.createdAt instanceof Date)).toBe(true);
  });

  it("allows only one of several concurrent commands on the same version", async () => {
    const t = await setup();
    const version = (await t.view()).version;
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() =>
        applyDamageCommand(
          {
            combatId: t.combatId,
            expectedVersion: version,
            combatantId: t.ids.b,
            amount: 3,
          },
          db,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected"))
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        CombatConflictError,
      );
    expect(await hpOf(t, t.ids.b)).toBe(17);
    const events = await listCombatEvents(t.combatId, { filter: "hp" }, db);
    expect(events).toHaveLength(1);
  });

  it("a repeated submission or retry applies exactly once", async () => {
    const t = await setup();
    const version = (await t.view()).version;
    const cmd = {
      combatId: t.combatId,
      expectedVersion: version,
      combatantId: t.ids.b,
      amount: 4,
    };
    await applyDamageCommand(cmd, db);
    await expect(applyDamageCommand(cmd, db)).rejects.toBeInstanceOf(
      CombatConflictError,
    );
    // A retry carrying the same idempotency key is acknowledged, not re-applied.
    const key = {
      ...cmd,
      expectedVersion: (await t.view()).version,
      idempotencyKey: "retry-key-0001",
    };
    const first = await applyDamageCommand(key, db);
    const again = await applyDamageCommand(key, db);
    expect((again as { replayed?: boolean }).replayed).toBe(true);
    expect(again.seq).toBe(first.seq);
    expect(await hpOf(t, t.ids.b)).toBe(12);
  });

  it("a failed save leaves state, version and log untouched", async () => {
    const t = await setup();
    const before = await t.view();
    const count = (await listCombatEvents(t.combatId, {}, db)).length;
    await expect(
      applyDamageCommand(
        {
          combatId: t.combatId,
          expectedVersion: before.version,
          combatantId: t.ids.b,
          amount: -5,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      applyDamageCommand(
        {
          combatId: t.combatId,
          expectedVersion: before.version,
          combatantId: "missing",
          amount: 5,
        },
        db,
      ),
    ).rejects.toThrow();
    const after = await t.view();
    expect(after.version).toBe(before.version);
    expect(await hpOf(t, t.ids.b)).toBe(20);
    expect((await listCombatEvents(t.combatId, {}, db)).length).toBe(count);
  });

  it("undo keeps the audit trail and refuses to erase dependent later changes", async () => {
    const t = await setup();
    const dmg = (amount: number) =>
      applyDamageCommand(
        {
          combatId: t.combatId,
          expectedVersion: 0,
          combatantId: t.ids.b,
          amount,
        },
        db,
      );
    void dmg;
    const run = async (amount: number) =>
      applyDamageCommand(
        {
          combatId: t.combatId,
          expectedVersion: (await t.view()).version,
          combatantId: t.ids.b,
          amount,
        },
        db,
      );
    await run(5);
    await undoLast(
      { combatId: t.combatId, expectedVersion: (await t.view()).version },
      db,
    );
    expect(await hpOf(t, t.ids.b)).toBe(20);
    const events = await listCombatEvents(t.combatId, {}, db);
    expect(events[0].type).toBe("undo");
    expect(events.find((e) => e.type === "damage")!.undone).toBe(true);

    // An external change to the same values makes the undo unsafe.
    await run(3);
    await prisma.combatant.update({
      where: { id: t.ids.b },
      data: { currentHp: 5 },
    });
    await expect(
      undoLast(
        { combatId: t.combatId, expectedVersion: (await t.view()).version },
        db,
      ),
    ).rejects.toBeInstanceOf(UndoConflictError);
    expect(await hpOf(t, t.ids.b)).toBe(5);
  });

  it("records rolls with their origin and filters the log", async () => {
    const t = await setup();
    const record = makeRollRecord({
      kind: "attack",
      actorId: t.ids.a,
      targetId: t.ids.b,
      label: "Slash",
      bonus: 4,
      mode: "normal",
      dc: null,
      halfOnSuccess: false,
      manualD20: [12],
      damage: [{ expr: "1d6", type: "slashing", manual: [4] }],
    });
    await confirmResolution(
      {
        combatId: t.combatId,
        expectedVersion: (await t.view()).version,
        record,
        overrides: {},
      },
      db,
    );
    await confirmResolution(
      {
        combatId: t.combatId,
        expectedVersion: (await t.view()).version,
        record,
        overrides: { final: 1 },
      },
      db,
    );
    const rolls = await listCombatEvents(t.combatId, { filter: "rolls" }, db);
    expect(rolls).toHaveLength(2);
    expect(rolls[0].origin).toBe("override");
    expect(rolls[1].origin).toBe("calculated");
    expect(rolls[1].roll).toMatchObject({
      natural: 12,
      total: 16,
      manualDice: true,
    });
    const byTarget = await listCombatEvents(
      t.combatId,
      { combatantId: t.ids.b },
      db,
    );
    expect(byTarget.every((e) => e.targetCombatantId === t.ids.b)).toBe(true);
    const turns = await listCombatEvents(t.combatId, { filter: "turns" }, db);
    expect(
      turns.every((e) =>
        [
          "turn_changed",
          "combat_status_changed",
          "combat_created",
          "combat_ended",
        ].includes(e.type),
      ),
    ).toBe(true);
  });

  it("pauses, resumes and ends while preserving history", async () => {
    const t = await setup();
    const step = async (to: "paused" | "running") =>
      setCombatStatus(
        { combatId: t.combatId, expectedVersion: (await t.view()).version, to },
        db,
      );
    await step("paused");
    expect((await t.view()).status).toBe("paused");
    await step("running");
    expect((await t.view()).status).toBe("running");
    const countBefore = (await listCombatEvents(t.combatId, {}, db)).length;
    await endCombat(
      { combatId: t.combatId, expectedVersion: (await t.view()).version },
      db,
    );
    const ended = await t.view();
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).not.toBeNull();
    const events = await listCombatEvents(t.combatId, {}, db);
    expect(events.length).toBe(countBefore + 1);
    expect(events[0].type).toBe("combat_ended");
    await expect(
      applyDamageCommand(
        {
          combatId: t.combatId,
          expectedVersion: ended.version,
          combatantId: t.ids.b,
          amount: 1,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await expect(step("running")).rejects.toThrow();
    const recent = await listRecentEndedCombats(db, 50);
    expect(recent.some((c) => c.id === t.combatId)).toBe(true);
  });
});
