import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  CombatConflictError,
  addCombatant,
  createAdHocCombat,
  getCombat,
  listCombatEvents,
  type LiveCombatDb,
} from "./live-combat";
import { makeRollRecord } from "./resolution";
import {
  confirmResolution,
  decodeRecord,
  encodeRecord,
} from "./resolve-service";

const url = process.env.COMBAT_TEST_DATABASE_URL;
const safe = !!url && /scratch|test/i.test(new URL(url).pathname);

describe.skipIf(!safe)("attack resolution (integration)", () => {
  let prisma: PrismaClient;
  let db: LiveCombatDb;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    db = prisma;
    campaignId = (await prisma.campaign.create({ data: { name: "Resolve" } }))
      .id;
  });
  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function setup() {
    const created = await createAdHocCombat({ campaignId }, db);
    let version = created.version;
    for (const name of ["Attacker", "Target"]) {
      await addCombatant(
        {
          combatId: created.combatId,
          expectedVersion: version,
          name,
          side: name === "Target" ? "party" : "enemy",
          maxHp: 30,
          armorClass: 12,
        },
        db,
      );
      version = (await getCombat(created.combatId, db))!.version;
    }
    const view = async () => (await getCombat(created.combatId, db))!;
    const v = await view();
    const attacker = v.combatants.find((c) => c.name === "Attacker")!;
    const target = v.combatants.find((c) => c.name === "Target")!;
    const record = (d20: number, dice: number[]) =>
      makeRollRecord({
        kind: "attack",
        actorId: attacker.id,
        targetId: target.id,
        label: "Slash",
        bonus: 4,
        mode: "normal",
        dc: null,
        halfOnSuccess: false,
        manualD20: [d20],
        damage: [{ expr: "1d8+2", type: "slashing", manual: dice }],
      });
    return { combatId: created.combatId, view, target, record };
  }

  it("round-trips the record through the URL encoding and rejects junk", () => {
    expect(decodeRecord("not-base64!!")).toBeNull();
    expect(
      decodeRecord(Buffer.from('{"v":2}').toString("base64url")),
    ).toBeNull();
  });

  it("confirm applies a hit once, recomputed on the server", async () => {
    const t = await setup();
    const record = decodeRecord(encodeRecord(t.record(12, [5])));
    const before = await t.view();
    expect(before.combatants.find((c) => c.id === t.target.id)!.currentHp).toBe(
      30,
    );
    const out = await confirmResolution(
      {
        combatId: t.combatId,
        expectedVersion: before.version,
        record,
        overrides: {},
      },
      db,
    );
    expect(out.applied).toBe(7);
    const after = await t.view();
    expect(after.combatants.find((c) => c.id === t.target.id)!.currentHp).toBe(
      23,
    );
    // A double submit carries the old version and is rejected.
    await expect(
      confirmResolution(
        {
          combatId: t.combatId,
          expectedVersion: before.version,
          record,
          overrides: {},
        },
        db,
      ),
    ).rejects.toBeInstanceOf(CombatConflictError);
    expect(
      (await t.view()).combatants.find((c) => c.id === t.target.id)!.currentHp,
    ).toBe(23);
  });

  it("a miss records a note and no damage; overrides are honoured", async () => {
    const t = await setup();
    const miss = t.record(3, [8]);
    let v = await t.view();
    const out = await confirmResolution(
      {
        combatId: t.combatId,
        expectedVersion: v.version,
        record: miss,
        overrides: {},
      },
      db,
    );
    expect(out.applied).toBe(0);
    v = await t.view();
    expect(v.combatants.find((c) => c.id === t.target.id)!.currentHp).toBe(30);
    expect((await listCombatEvents(t.combatId, {}, db))[0].type).toBe("note");

    const forced = await confirmResolution(
      {
        combatId: t.combatId,
        expectedVersion: v.version,
        record: miss,
        overrides: { hit: "hit", final: 4 },
      },
      db,
    );
    expect(forced.applied).toBe(4);
    v = await t.view();
    expect(v.combatants.find((c) => c.id === t.target.id)!.currentHp).toBe(26);
  });

  it("rejects a record for a combatant that does not exist", async () => {
    const t = await setup();
    const bad = { ...t.record(15, [4]), targetId: "nope" };
    const v = await t.view();
    await expect(
      confirmResolution(
        {
          combatId: t.combatId,
          expectedVersion: v.version,
          record: bad,
          overrides: {},
        },
        db,
      ),
    ).rejects.toThrow();
  });
});
