import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import {
  addCombatant,
  addEffect,
  advanceTurn,
  createAdHocCombat,
  DuplicateEffectError,
  EffectNotFoundError,
  getCombat,
  InvalidCombatStateError,
  listCombatEvents,
  removeCombatant,
  removeEffect,
  setCombatStatus,
  setDefeated,
  undoLast,
  updateEffect,
  type LiveCombatDb,
} from "./live-combat";
import { effectReminders } from "./engine";
import { listConditionDefinitions } from "./conditions";

// Runs only against a throwaway database, never the working one.
const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("conditions and effects (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "Effects" } }))
      .id;
    const source = await prisma.ruleSource.create({
      data: {
        provider: "test",
        apiEdition: "test",
        apiBaseUrl: "https://example.invalid",
        srdLabel: "test",
        licenseName: "test",
        licenseUrl: "https://example.invalid",
        attribution: "test",
      },
    });
    await prisma.ruleEntry.create({
      data: {
        origin: "imported",
        sourceId: source.id,
        contentHash: "test",
        category: "conditions",
        sourceKey: `test-condition-${Date.now()}`,
        name: "Test Condition",
        rawData: { description: "While you have it, **bad** things happen." },
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function setup() {
    const created = await createAdHocCombat({ campaignId }, db);
    let version = created.version;
    for (const [name, initiative] of [
      ["Ana", 20],
      ["Bo", 15],
      ["Cy", 10],
    ] as const) {
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
    await setCombatStatus(
      { combatId: created.combatId, expectedVersion: version, to: "running" },
      db,
    );
    const view = async () => (await getCombat(created.combatId, db))!;
    const ids = Object.fromEntries(
      (await view()).combatants.map((c) => [c.name, c.id]),
    ) as Record<"Ana" | "Bo" | "Cy", string>;
    const base = async () => ({
      combatId: created.combatId,
      expectedVersion: (await view()).version,
    });
    const next = async () =>
      advanceTurn({ ...(await base()), direction: "next" }, db);
    const reminders = async () => {
      const v = await view();
      return effectReminders(
        v.effects.map((e) => ({ ...e, isActive: true })),
        {
          round: v.round,
          activeCombatantId: v.activeCombatantId,
          order: v.turnOrder,
        },
      );
    };
    return { combatId: created.combatId, ids, view, base, next, reminders };
  }

  it("applies and removes a manual effect, logging both with who applied it", async () => {
    const t = await setup();
    const { effectId } = await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        sourceCombatantId: t.ids.Ana,
        kind: "condition",
        name: "Frightened",
        note: "by the dragon",
      },
      db,
    );
    const [effect] = (await t.view()).effects;
    expect(effect).toMatchObject({
      id: effectId,
      targetId: t.ids.Bo,
      sourceCombatantId: t.ids.Ana,
      startedRound: 1,
      expiresAtRound: null,
      expiryTrigger: "none",
      note: "by the dragon",
    });
    // An untimed effect stays through many rounds.
    for (let i = 0; i < 7; i++) await t.next();
    expect((await t.view()).effects).toHaveLength(1);
    expect(await t.reminders()).toEqual([]);

    await removeEffect(
      { ...(await t.base()), effectId, resolution: "resolved" },
      db,
    );
    expect((await t.view()).effects).toHaveLength(0);
    const log = (await listCombatEvents(t.combatId, {}, db)).map(
      (e) => e.summary,
    );
    expect(log).toContain("Frightened resolved");
    expect(log.some((s) => s.includes("Frightened on Bo"))).toBe(true);
    await expect(
      removeEffect({ ...(await t.base()), effectId }, db),
    ).rejects.toBeInstanceOf(EffectNotFoundError);
  });

  it("links library conditions, keeps definitions separate, and rejects duplicates and unknown ones", async () => {
    const t = await setup();
    const conditions = await listConditionDefinitions(prisma);
    const lib = conditions.find((c) => c.name === "Test Condition")!;
    expect(lib.description).toMatch(/bad/);
    {
      await addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Bo,
          kind: "condition",
          name: "ignored",
          conditionIndex: lib.index,
        },
        db,
      );
      const [effect] = (await t.view()).effects;
      expect(effect.name).toBe(lib.name);
      expect(effect.conditionIndex).toBe(lib.index);
      await expect(
        addEffect(
          {
            ...(await t.base()),
            targetId: t.ids.Bo,
            kind: "condition",
            name: "x",
            conditionIndex: lib.index,
          },
          db,
        ),
      ).rejects.toBeInstanceOf(DuplicateEffectError);
      // Applying an effect never edits the library entry.
      const after = await listConditionDefinitions(prisma);
      expect(after.find((c) => c.index === lib.index)).toEqual(lib);
    }
    await expect(
      addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Bo,
          kind: "condition",
          name: "x",
          conditionIndex: "no-such-condition",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
  });

  it("start-of-turn effects become due on that turn and stay until the DM acts", async () => {
    const t = await setup();
    await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        kind: "condition",
        name: "Stunned",
        durationRounds: 1,
        expiryTrigger: "start_of_target_turn",
      },
      db,
    );
    expect(await t.reminders()).toEqual([]); // Ana's turn, round 1
    await t.next(); // Bo, round 1: expires at round 2
    expect(await t.reminders()).toEqual([]);
    await t.next();
    await t.next(); // Ana, round 2
    expect(await t.reminders()).toEqual([]);
    await t.next(); // Bo, round 2
    expect(await t.reminders()).toHaveLength(1);
    const again = await t.reminders(); // a "refresh" yields the same single reminder
    expect(again).toHaveLength(1);
    await t.next(); // moving on does not drop it
    expect((await t.view()).effects).toHaveLength(1);
    expect(await t.reminders()).toHaveLength(1);
    await removeEffect(
      {
        ...(await t.base()),
        effectId: (await t.view()).effects[0].id,
        resolution: "expired",
      },
      db,
    );
    expect(await t.reminders()).toEqual([]);
  });

  it("end-of-turn effects are due only after the turn and can be extended, with undo", async () => {
    const t = await setup();
    const { effectId } = await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Ana,
        kind: "condition",
        name: "Slowed",
        durationRounds: 1,
        expiryTrigger: "end_of_target_turn",
      },
      db,
    );
    expect(await t.reminders()).toEqual([]); // round 1 < 2
    await t.next();
    await t.next();
    await t.next(); // Ana, round 2
    expect((await t.reminders())[0]).toMatchObject({ phase: "upcoming" });
    await t.next(); // Bo, round 2: Ana's turn ended
    expect((await t.reminders())[0]).toMatchObject({ phase: "due" });

    await updateEffect({ ...(await t.base()), effectId, extendRounds: 2 }, db);
    expect((await t.view()).effects[0].expiresAtRound).toBe(4);
    expect(await t.reminders()).toEqual([]);

    await undoLast(await t.base(), db);
    expect((await t.view()).effects[0].expiresAtRound).toBe(2);
    expect(await t.reminders()).toHaveLength(1);
    await expect(
      updateEffect({ ...(await t.base()), effectId, extendRounds: 0 }, db),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects extending an untimed effect and validates timing", async () => {
    const t = await setup();
    const { effectId } = await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        kind: "condition",
        name: "Marked",
      },
      db,
    );
    await expect(
      updateEffect({ ...(await t.base()), effectId, extendRounds: 1 }, db),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
    await expect(
      addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Bo,
          kind: "condition",
          name: "Bad",
          durationRounds: 2,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Bo,
          kind: "condition",
          name: "Bad",
          durationRounds: 2,
          expiryTrigger: "end_of_source_turn",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    // Setting a duration on an untimed effect through an edit is allowed.
    await updateEffect(
      {
        ...(await t.base()),
        effectId,
        expiresAtRound: 3,
        expiryTrigger: "end_of_target_turn",
      },
      db,
    );
    expect((await t.view()).effects[0]).toMatchObject({
      expiresAtRound: 3,
      expiryTrigger: "end_of_target_turn",
    });
  });

  it("stores saving-throw and ongoing-damage reminders without resolving them", async () => {
    const t = await setup();
    await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        kind: "ongoing",
        name: "Burning",
        metadata: {
          save: { ability: "DEX", dc: 12, timing: "end" },
          remindAt: "start",
          damageDice: "1d6",
          damageType: "fire",
        },
      },
      db,
    );
    expect(await t.reminders()).toEqual([]); // Ana's turn
    await t.next(); // Bo
    const kinds = (await t.reminders()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["ongoing", "save"]);
    const bo = (await t.view()).combatants.find((c) => c.id === t.ids.Bo)!;
    expect(bo.currentHp).toBe(10); // nothing was rolled or applied
    expect((await t.view()).effects).toHaveLength(1);
    await expect(
      addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Bo,
          kind: "ongoing",
          name: "Bad",
          metadata: { save: { ability: "LUCK", dc: 12, timing: "end" } },
        },
        db,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("records concentration and warns about a second concentration effect", async () => {
    const t = await setup();
    const first = await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        sourceCombatantId: t.ids.Ana,
        kind: "condition",
        name: "Held",
        concentration: true,
      },
      db,
    );
    expect(first.warnings).toEqual([]);
    const second = await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Cy,
        sourceCombatantId: t.ids.Ana,
        kind: "condition",
        name: "Blessed",
        concentration: true,
      },
      db,
    );
    expect(second.warnings[0]).toMatch(/already concentrating on Held/);
    const effects = (await t.view()).effects;
    expect(effects.every((e) => e.concentration)).toBe(true);
    // The DM decides; nothing was removed automatically.
    expect(effects).toHaveLength(2);
  });

  it("keeps effects on defeated creatures, ends them when removed, and flags orphaned timing", async () => {
    const t = await setup();
    await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Cy,
        sourceCombatantId: t.ids.Bo,
        kind: "condition",
        name: "Cursed",
        durationRounds: 1,
        expiryTrigger: "start_of_source_turn",
      },
      db,
    );
    await addEffect(
      {
        ...(await t.base()),
        targetId: t.ids.Bo,
        kind: "condition",
        name: "Poisoned",
      },
      db,
    );
    await setDefeated(
      { ...(await t.base()), combatantId: t.ids.Bo, defeated: true },
      db,
    );
    // Defeated: effects stay visible and the source's turn will never come.
    expect((await t.view()).effects).toHaveLength(2);
    const orphan = (await t.reminders()).find((r) => r.kind === "expiry");
    expect(orphan?.phase).toBe("due");
    expect(orphan?.text).toMatch(/no longer in the turn order/);

    await removeCombatant({ ...(await t.base()), combatantId: t.ids.Bo }, db);
    const names = (await t.view()).effects.map((e) => e.name);
    expect(names).toEqual(["Cursed"]); // Bo's own effect ended with Bo
  });

  it("applies once under concurrent requests and refuses effects on removed combatants", async () => {
    const t = await setup();
    const base = await t.base();
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        addEffect(
          { ...base, targetId: t.ids.Bo, kind: "condition", name: "Prone" },
          db,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await t.view()).effects).toHaveLength(1);

    await removeCombatant({ ...(await t.base()), combatantId: t.ids.Cy }, db);
    await expect(
      addEffect(
        {
          ...(await t.base()),
          targetId: t.ids.Cy,
          kind: "condition",
          name: "Blinded",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(InvalidCombatStateError);
  });
});
