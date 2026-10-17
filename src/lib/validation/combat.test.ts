import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_COMBATANTS,
  bossPhasesSchema,
  canTransitionCombat,
  changeSchema,
  commandSchemas,
  creatureSnapshotSchema,
  effectInputSchema,
  encounterEntryInputSchema,
  encounterEntryUpdateSchema,
  eventPayloadSchema,
} from "./combat";

const base = { combatId: "c1", expectedVersion: 0 };

describe("combat status transitions", () => {
  it("allows the legal flow and treats ended as terminal", () => {
    expect(canTransitionCombat("setup", "running")).toBe(true);
    expect(canTransitionCombat("running", "paused")).toBe(true);
    expect(canTransitionCombat("paused", "running")).toBe(true);
    expect(canTransitionCombat("paused", "ended")).toBe(true);
    expect(canTransitionCombat("setup", "paused")).toBe(false);
    expect(canTransitionCombat("running", "setup")).toBe(false);
    expect(canTransitionCombat("ended", "running")).toBe(false);
  });
});

describe("encounterEntryInputSchema", () => {
  it("accepts a monster with a library reference", () => {
    const parsed = encounterEntryInputSchema.parse({
      kind: "monster",
      ruleEntryId: "r1",
      label: "Goblin",
      quantity: 4,
    });
    expect(parsed).toMatchObject({
      quantity: 4,
      hpMode: "average",
      wave: 0,
      startsHidden: false,
    });
  });

  it("requires the reference for each kind", () => {
    expect(
      encounterEntryInputSchema.safeParse({ kind: "monster", label: "x" })
        .success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({ kind: "npc", label: "x" }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "player_character",
        label: "x",
      }).success,
    ).toBe(false);
  });

  it("limits quantity, and players can only be added once", () => {
    const monster = { kind: "monster", ruleEntryId: "r1", label: "x" };
    expect(
      encounterEntryInputSchema.safeParse({ ...monster, quantity: 0 }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({ ...monster, quantity: 51 }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "player_character",
        playerCharacterId: "p1",
        label: "Aria",
        hpMode: "manual",
        quantity: 2,
      }).success,
    ).toBe(false);
  });

  it("requires explicit stats for custom entries and NPCs without a stat basis", () => {
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "custom",
        label: "Bandit",
        hpMode: "manual",
      }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "custom",
        label: "Bandit",
        hpMode: "manual",
        overrides: { maxHp: 11, armorClass: 12 },
      }).success,
    ).toBe(true);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "npc",
        npcId: "n1",
        label: "Guard",
        hpMode: "manual",
        overrides: { maxHp: 11, armorClass: 12 },
      }).success,
    ).toBe(true);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "npc",
        npcId: "n1",
        ruleEntryId: "r1",
        label: "Guard",
      }).success,
    ).toBe(true);
  });

  it("rejects cross-kind references and unknown override keys", () => {
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "monster",
        ruleEntryId: "r1",
        npcId: "n1",
        label: "x",
      }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({
        kind: "monster",
        ruleEntryId: "r1",
        label: "x",
        overrides: { maxHp: 5, __proto__: { x: 1 }, hacked: true },
      }).success,
    ).toBe(false);
  });

  it("bounds HP, AC and label length", () => {
    const monster = { kind: "monster", ruleEntryId: "r1", label: "x" };
    expect(
      encounterEntryInputSchema.safeParse({
        ...monster,
        hpMode: "manual",
        overrides: { maxHp: 1_000_000 },
      }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({
        ...monster,
        overrides: { armorClass: 100 },
      }).success,
    ).toBe(false);
    expect(
      encounterEntryInputSchema.safeParse({ ...monster, label: "x".repeat(81) })
        .success,
    ).toBe(false);
  });

  it("update schema rejects identity fields", () => {
    expect(
      encounterEntryUpdateSchema.safeParse({ kind: "custom" }).success,
    ).toBe(false);
    expect(
      encounterEntryUpdateSchema.safeParse({ ruleEntryId: "x" }).success,
    ).toBe(false);
    expect(encounterEntryUpdateSchema.safeParse({ quantity: 3 }).success).toBe(
      true,
    );
  });
});

describe("commandSchemas", () => {
  it("requires ids and a version on every command", () => {
    expect(
      commandSchemas.damage.safeParse({
        combatId: "c1",
        combatantId: "x",
        amount: 3,
      }).success,
    ).toBe(false);
    expect(
      commandSchemas.damage.safeParse({ ...base, combatantId: "", amount: 3 })
        .success,
    ).toBe(false);
    expect(
      commandSchemas.damage.safeParse({ ...base, combatantId: "x", amount: 3 })
        .success,
    ).toBe(true);
  });

  it("bounds damage, healing and initiative", () => {
    expect(
      commandSchemas.damage.safeParse({ ...base, combatantId: "x", amount: 0 })
        .success,
    ).toBe(false);
    expect(
      commandSchemas.damage.safeParse({
        ...base,
        combatantId: "x",
        amount: 1.5,
      }).success,
    ).toBe(false);
    expect(
      commandSchemas.heal.safeParse({ ...base, combatantId: "x", amount: -2 })
        .success,
    ).toBe(false);
    expect(
      commandSchemas.setInitiative.safeParse({
        ...base,
        combatantId: "x",
        initiative: 61,
      }).success,
    ).toBe(false);
    expect(
      commandSchemas.setInitiative.safeParse({
        ...base,
        combatantId: "x",
        initiative: null,
      }).success,
    ).toBe(true);
  });

  it("validates idempotency key length and negative versions", () => {
    expect(
      commandSchemas.addNote.safeParse({
        ...base,
        text: "hi",
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
    expect(
      commandSchemas.addNote.safeParse({
        ...base,
        expectedVersion: -1,
        text: "hi",
      }).success,
    ).toBe(false);
  });

  it("boss phase index cannot exceed configured phases", () => {
    expect(
      commandSchemas.updateCombatant.safeParse({
        ...base,
        combatantId: "x",
        bossPhases: [{ name: "Enraged", hpAtOrBelow: 50 }],
        currentPhase: 2,
      }).success,
    ).toBe(false);
    expect(
      bossPhasesSchema.safeParse(Array(11).fill({ name: "p" })).success,
    ).toBe(false);
  });

  it("limits stay in sync with documented maxima", () => {
    expect(MAX_COMBATANTS).toBe(200);
  });
});

describe("effectInputSchema", () => {
  const effect = {
    ...base,
    targetId: "t1",
    kind: "condition" as const,
    name: "Poisoned",
  };

  it("accepts an untimed condition and a timed one with a trigger", () => {
    expect(effectInputSchema.safeParse(effect).success).toBe(true);
    expect(
      effectInputSchema.safeParse({
        ...effect,
        durationRounds: 3,
        expiryTrigger: "end_of_target_turn",
      }).success,
    ).toBe(true);
  });

  it("requires trigger and duration together, and a source for source-turn expiry", () => {
    expect(
      effectInputSchema.safeParse({ ...effect, durationRounds: 3 }).success,
    ).toBe(false);
    expect(
      effectInputSchema.safeParse({
        ...effect,
        expiryTrigger: "end_of_target_turn",
      }).success,
    ).toBe(false);
    expect(
      effectInputSchema.safeParse({
        ...effect,
        durationRounds: 2,
        expiryTrigger: "start_of_source_turn",
      }).success,
    ).toBe(false);
  });

  it("ongoing effects need a description or damage dice, and dice must parse", () => {
    expect(
      effectInputSchema.safeParse({ ...effect, kind: "ongoing" }).success,
    ).toBe(false);
    expect(
      effectInputSchema.safeParse({
        ...effect,
        kind: "ongoing",
        metadata: { damageDice: "1d6", damageType: "Fire" },
      }).success,
    ).toBe(true);
    expect(
      effectInputSchema.safeParse({
        ...effect,
        kind: "ongoing",
        metadata: { damageDice: "lots" },
      }).success,
    ).toBe(false);
  });
});

describe("stored JSON schemas", () => {
  it("changeSchema rejects fields outside the whitelist", () => {
    expect(
      changeSchema.safeParse({
        kind: "update",
        entity: "combatant",
        id: "c",
        before: { combatId: "other" },
        after: { combatId: "x" },
      }).success,
    ).toBe(false);
    expect(
      changeSchema.safeParse({
        kind: "update",
        entity: "combatant",
        id: "c",
        before: { currentHp: 5 },
        after: { currentHp: 2 },
      }).success,
    ).toBe(true);
  });

  it("eventPayloadSchema requires a known schema version", () => {
    expect(
      eventPayloadSchema.safeParse({
        schemaVersion: 2,
        changes: [],
        detail: {},
      }).success,
    ).toBe(false);
    expect(
      eventPayloadSchema.safeParse({
        schemaVersion: 1,
        changes: [],
        detail: {},
      }).success,
    ).toBe(true);
  });

  it("creatureSnapshotSchema rejects unreadable snapshots", () => {
    expect(creatureSnapshotSchema.safeParse({}).success).toBe(false);
    expect(creatureSnapshotSchema.safeParse({ schemaVersion: 1 }).success).toBe(
      false,
    );
  });
});

describe("combat migration safety", () => {
  const dir = join(process.cwd(), "prisma", "migrations");
  const folder = readdirSync(dir).find((d) => d.endsWith("_combat_data_model"));

  it("exists and contains no destructive statements", () => {
    expect(folder).toBeDefined();
    const sql = readFileSync(join(dir, folder!, "migration.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/\bALTER\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"/i);
  });

  it("only alters an existing table by adding a defaulted column", () => {
    const sql = readFileSync(join(dir, folder!, "migration.sql"), "utf8");
    const alters = [
      ...sql.matchAll(/^ALTER TABLE "(\w+)" ADD COLUMN\s+(.+)$/gm),
    ];
    expect(alters.map((m) => m[1])).toEqual(["PlayerCharacter"]);
    expect(alters[0][2]).toMatch(/DEFAULT 0/);
  });
});
