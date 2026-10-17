import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  addCombatant,
  applyDamageCommand,
  applyHealCommand,
  CombatConflictError,
  createAdHocCombat,
  getCombat,
  InvalidCombatStateError,
  listCombatEvents,
  removeCombatant,
  setCurrentHp,
  setMaxHp,
  setTempHp,
  undoLast,
  UndoConflictError,
  type LiveCombatDb,
} from "./live-combat";
import { ZodError } from "zod";

// Runs only against a throwaway database, never the working one.
const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("HP management (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "HP" } })).id;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function setup(maxHp = 20) {
    const created = await createAdHocCombat({ campaignId }, db);
    await addCombatant(
      {
        combatId: created.combatId,
        expectedVersion: created.version,
        name: "Target",
        side: "enemy",
        maxHp,
        armorClass: 12,
      },
      db,
    );
    const view = async () => (await getCombat(created.combatId, db))!;
    const id = (await view()).combatants[0].id;
    const hp = async () => {
      const c = (await view()).combatants[0];
      return { hp: c.currentHp, temp: c.tempHp, max: c.maxHp };
    };
    const base = async () => ({
      combatId: created.combatId,
      expectedVersion: (await view()).version,
      combatantId: id,
    });
    return { combatId: created.combatId, id, view, hp, base };
  }

  it("applies damage, temp HP first, and never drops below zero", async () => {
    const t = await setup(20);
    await setTempHp({ ...(await t.base()), value: 5 }, db);
    await applyDamageCommand({ ...(await t.base()), amount: 8 }, db);
    expect(await t.hp()).toEqual({ hp: 17, temp: 0, max: 20 });
    await applyDamageCommand({ ...(await t.base()), amount: 100 }, db);
    expect(await t.hp()).toEqual({ hp: 0, temp: 0, max: 20 });
    const events = await listCombatEvents(t.combatId, {}, db);
    const last = events[0];
    expect(last.summary).toMatch(/takes 100/);
  });

  it("heals up to max HP only and reports the wasted amount", async () => {
    const t = await setup(20);
    await applyDamageCommand({ ...(await t.base()), amount: 5 }, db);
    await applyHealCommand({ ...(await t.base()), amount: 50 }, db);
    expect(await t.hp()).toEqual({ hp: 20, temp: 0, max: 20 });
    const row = await prisma.combatEvent.findFirst({
      where: { combatId: t.combatId, type: "heal" },
    });
    expect(
      (row!.payload as { detail: { healed: number; wasted: number } }).detail,
    ).toMatchObject({
      healed: 5,
      wasted: 45,
    });
  });

  it("applies resistance, vulnerability and immunity once, with an override", async () => {
    const t = await setup(50);
    await applyDamageCommand(
      {
        ...(await t.base()),
        amount: 9,
        damageType: "fire",
        adjustment: "resistance",
      },
      db,
    );
    expect((await t.hp()).hp).toBe(46); // 9 halved, rounded down = 4
    await applyDamageCommand(
      { ...(await t.base()), amount: 5, adjustment: "vulnerability" },
      db,
    );
    expect((await t.hp()).hp).toBe(36);
    await applyDamageCommand(
      { ...(await t.base()), amount: 30, adjustment: "immunity" },
      db,
    );
    expect((await t.hp()).hp).toBe(36);
    // The DM override replaces the calculated value, and is recorded as such.
    await applyDamageCommand(
      {
        ...(await t.base()),
        amount: 10,
        adjustment: "resistance",
        override: 7,
        note: "ruled by DM",
      },
      db,
    );
    expect((await t.hp()).hp).toBe(29);
    const row = await prisma.combatEvent.findFirst({
      where: { combatId: t.combatId, type: "damage" },
      orderBy: { seq: "desc" },
    });
    const detail = (row!.payload as { detail: Record<string, unknown> }).detail;
    expect(detail).toMatchObject({
      requested: 10,
      calculated: 5,
      final: 7,
      overridden: true,
      note: "ruled by DM",
    });
    // Override of zero is legal and logs the event without changing HP.
    await applyDamageCommand(
      { ...(await t.base()), amount: 4, override: 0 },
      db,
    );
    expect((await t.hp()).hp).toBe(29);
  });

  it("temp HP does not stack: keep-higher or explicit replace, and can be cleared", async () => {
    const t = await setup();
    await setTempHp({ ...(await t.base()), value: 8 }, db);
    await expect(
      setTempHp({ ...(await t.base()), value: 5, mode: "keep_higher" }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    expect((await t.hp()).temp).toBe(8);
    await setTempHp({ ...(await t.base()), value: 5, mode: "replace" }, db);
    expect((await t.hp()).temp).toBe(5);
    await setTempHp(
      { ...(await t.base()), value: 12, mode: "keep_higher" },
      db,
    );
    expect((await t.hp()).temp).toBe(12);
    await setTempHp({ ...(await t.base()), value: 0, mode: "replace" }, db);
    expect((await t.hp()).temp).toBe(0);
  });

  it("manual current HP is bounded by max HP; max HP stays separate", async () => {
    const t = await setup(20);
    await setCurrentHp(
      { ...(await t.base()), value: 3, note: "fixing a typo" },
      db,
    );
    expect(await t.hp()).toEqual({ hp: 3, temp: 0, max: 20 });
    await expect(
      setCurrentHp({ ...(await t.base()), value: 21 }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await expect(
      setCurrentHp({ ...(await t.base()), value: 3 }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await setMaxHp({ ...(await t.base()), maxHp: 40 }, db);
    expect(await t.hp()).toEqual({ hp: 3, temp: 0, max: 40 });
    await setCurrentHp({ ...(await t.base()), value: 40 }, db);
    await setMaxHp({ ...(await t.base()), maxHp: 10 }, db);
    expect(await t.hp()).toEqual({ hp: 10, temp: 0, max: 10 });
  });

  it("rejects invalid input and removed combatants without changing state", async () => {
    const t = await setup(20);
    for (const amount of [0, -3, 1.5, Number.NaN, 1_000_000]) {
      await expect(
        applyDamageCommand({ ...(await t.base()), amount }, db),
      ).rejects.toBeInstanceOf(ZodError);
      await expect(
        applyHealCommand({ ...(await t.base()), amount }, db),
      ).rejects.toBeInstanceOf(ZodError);
    }
    await expect(
      applyDamageCommand(
        { ...(await t.base()), amount: 3, adjustment: "halve" },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      applyDamageCommand({ ...(await t.base()), amount: 3, override: -1 }, db),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      applyDamageCommand(
        { ...(await t.base()), amount: 3, note: "x".repeat(201) },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await t.hp()).toEqual({ hp: 20, temp: 0, max: 20 });

    await removeCombatant(await t.base(), db);
    await expect(
      applyDamageCommand({ ...(await t.base()), amount: 3 }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
  });

  it("undoes the latest HP change exactly and logs the undo", async () => {
    const t = await setup(20);
    await setTempHp({ ...(await t.base()), value: 4 }, db);
    await applyDamageCommand({ ...(await t.base()), amount: 10 }, db);
    expect(await t.hp()).toEqual({ hp: 14, temp: 0, max: 20 });
    await undoLast(await t.base(), db);
    expect(await t.hp()).toEqual({ hp: 20, temp: 4, max: 20 });
    const events = await listCombatEvents(t.combatId, {}, db);
    expect(events[0].summary).toMatch(/^Undid:/);
    expect(events.find((e) => e.type === "damage")!.undone).toBe(true);
    // History is kept; the next undo targets the earlier temp HP event.
    await undoLast(await t.base(), db);
    expect(await t.hp()).toEqual({ hp: 20, temp: 0, max: 20 });
  });

  it("refuses an unsafe undo, then allows a force or a manual correction", async () => {
    const t = await setup(20);
    await applyDamageCommand({ ...(await t.base()), amount: 5 }, db);
    await applyDamageCommand({ ...(await t.base()), amount: 5 }, db);
    // Simulate drift: a change outside the log touches the same field.
    await prisma.combatant.update({
      where: { id: t.id },
      data: { currentHp: 9 },
    });
    await expect(undoLast(await t.base(), db)).rejects.toBeInstanceOf(
      UndoConflictError,
    );
    expect((await t.hp()).hp).toBe(9);
    await setCurrentHp(
      { ...(await t.base()), value: 12, note: "correction" },
      db,
    );
    expect((await t.hp()).hp).toBe(12);
    // The correction is itself the latest event, so it undoes cleanly.
    await undoLast(await t.base(), db);
    expect((await t.hp()).hp).toBe(9);
    // The earlier damage still conflicts with the drifted value until forced.
    await expect(undoLast(await t.base(), db)).rejects.toBeInstanceOf(
      UndoConflictError,
    );
    await undoLast({ ...(await t.base()), force: true }, db);
    expect((await t.hp()).hp).toBe(15);
  });

  it("concurrent and repeated damage requests apply once", async () => {
    const t = await setup(30);
    const cmd = { ...(await t.base()), amount: 4 };
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => applyDamageCommand(cmd, db)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        CombatConflictError,
      );
    }
    expect((await t.hp()).hp).toBe(26);
  });

  it("idempotency keys make a retried request a no-op", async () => {
    const t = await setup(30);
    const cmd = {
      ...(await t.base()),
      amount: 4,
      idempotencyKey: "retry-key-0001",
    };
    await applyDamageCommand(cmd, db);
    const again = await applyDamageCommand(cmd, db);
    expect(again.replayed).toBe(true);
    expect((await t.hp()).hp).toBe(26);
  });

  it("HP and history persist across a fresh connection", async () => {
    const t = await setup(20);
    await applyDamageCommand(
      { ...(await t.base()), amount: 6, damageType: "fire" },
      db,
    );
    await setTempHp({ ...(await t.base()), value: 3 }, db);
    const fresh = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    try {
      const view = (await getCombat(t.combatId, fresh))!;
      expect(view.combatants[0]).toMatchObject({
        currentHp: 14,
        tempHp: 3,
        maxHp: 20,
      });
      const events = await listCombatEvents(t.combatId, {}, fresh);
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining(["damage", "temp_hp_set"]),
      );
    } finally {
      await fresh.$disconnect();
    }
  });
});
