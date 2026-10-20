import {
  Prisma,
  type Combatant,
  type CombatEffect,
  type CombatEvent,
  type PrismaClient,
} from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  MAX_COMBATANTS,
  MAX_INITIATIVE,
  MIN_INITIATIVE,
  PAYLOAD_SCHEMA_VERSION,
  canTransitionCombat,
  commandSchemas,
  rollDetailSchema,
  type RollDetail,
  createAdHocCombatSchema,
  createCombatFromEncounterSchema,
  effectInputSchema,
  effectMetadataSchema,
  type EffectMetadata,
  eventPayloadSchema,
  idSchema,
  type Change,
  type CombatSideValue,
  type CombatStatusValue,
  type CreatureKindValue,
  type CreatureSnapshot,
} from "@/lib/validation/combat";
import {
  CampaignNotFoundError,
  EncounterNotFoundError,
} from "@/server/services/encounters/encounters";
import {
  chooseStartingHp,
  readSnapshot,
  resolveCreature,
  toSnapshotJson,
} from "./creature-templates";
import type { Rng } from "./dice";
import {
  adjustDamage,
  applyDamage,
  applyHeal,
  applyTempHp,
  findDueEffects,
  invertChanges,
  matchesExpected,
  nextTurn,
  numberedNames,
  orderCombatants,
  previousTurn,
  turnOrder,
  type EffectState,
  type TurnPosition,
} from "./engine";
import { z } from "zod";

type CombatEventTypeValue = CombatEvent["type"];

export { CampaignNotFoundError, EncounterNotFoundError };

export const MAX_EFFECTS_PER_COMBATANT = 30;

// ---- Errors ----------------------------------------------------------------

export class CombatNotFoundError extends Error {
  constructor(id: string) {
    super(`Combat not found: ${id}`);
    this.name = "CombatNotFoundError";
  }
}

/** The caller acted on a stale version; reload and retry. */
export class CombatConflictError extends Error {
  constructor(
    readonly combatId: string,
    readonly expectedVersion: number,
  ) {
    super(`Combat ${combatId} changed since version ${expectedVersion}`);
    this.name = "CombatConflictError";
  }
}

export class InvalidCombatStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCombatStateError";
  }
}

export class CombatantNotFoundError extends Error {
  constructor(id: string) {
    super(`Combatant not found in this combat: ${id}`);
    this.name = "CombatantNotFoundError";
  }
}

export class EffectNotFoundError extends Error {
  constructor(id: string) {
    super(`Active effect not found in this combat: ${id}`);
    this.name = "EffectNotFoundError";
  }
}

export class CombatLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CombatLimitError";
  }
}

export class EncounterInCombatError extends Error {
  constructor(id: string) {
    super(`Encounter already has an unfinished combat: ${id}`);
    this.name = "EncounterInCombatError";
  }
}

export class DuplicateEffectError extends Error {
  constructor(name: string) {
    super(`${name} is already active on this combatant from the same source`);
    this.name = "DuplicateEffectError";
  }
}

export class NothingToUndoError extends Error {
  constructor() {
    super("There is nothing to undo");
    this.name = "NothingToUndoError";
  }
}

/** Current state no longer matches what the event recorded; pass force to override. */
export class UndoConflictError extends Error {
  constructor(readonly seq: number) {
    super(`State changed since event ${seq}; undo needs confirmation`);
    this.name = "UndoConflictError";
  }
}

// ---- Types -----------------------------------------------------------------

export type LiveCombatDb = Pick<
  PrismaClient,
  | "$transaction"
  | "combat"
  | "combatant"
  | "combatEffect"
  | "combatEvent"
  | "encounter"
  | "encounterEntry"
  | "ruleEntry"
  | "ruleSource"
  | "npc"
  | "playerCharacter"
>;

type Tx = Prisma.TransactionClient;

export type CommandOptions = { rng?: Rng };

export type CommandResult<T extends object = object> = {
  combatId: string;
  version: number;
  seq: number;
  replayed: boolean;
} & T;

type CombatRow = {
  id: string;
  campaignId: string;
  encounterId: string | null;
  status: CombatStatusValue;
  round: number;
  activeCombatantId: string | null;
  version: number;
  eventSeq: number;
  startedAt: Date | null;
};

type EventType = Prisma.CombatEventUncheckedCreateInput["type"];

type Outcome<T extends object> = {
  type: EventType;
  summary: string;
  actorId?: string | null;
  targetId?: string | null;
  round?: number;
  changes: Change[];
  detail?: Record<string, unknown>;
  result?: T;
};

const OPEN_STATUSES: CombatStatusValue[] = ["setup", "running", "paused"];
const alive = { campaign: { deletedAt: null } } as const;

const DEFAULT_SIDE: Record<CreatureKindValue, CombatSideValue> = {
  monster: "enemy",
  custom: "enemy",
  npc: "neutral",
  player_character: "party",
};

// ---- Change helpers --------------------------------------------------------

function plain(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

/** Records only the fields that actually change, or null when nothing does. */
function updateChange(
  entity: "combat" | "combatant" | "effect",
  id: string,
  current: Record<string, unknown>,
  after: Record<string, unknown>,
): Change | null {
  const before: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(plain(current[key])) === JSON.stringify(plain(value)))
      continue;
    before[key] = plain(current[key]);
    next[key] = plain(value);
  }
  if (Object.keys(next).length === 0) return null;
  return { kind: "update", entity, id, before, after: next } as Change;
}

function compact(changes: (Change | null)[]): Change[] {
  return changes.filter((c): c is Change => c !== null);
}

function toPrismaData(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...fields };
  for (const key of ["startedAt", "endedAt"]) {
    if (key in data) {
      data[key] = typeof data[key] === "string" ? new Date(data[key]) : null;
    }
  }
  if ("bossPhases" in data && data.bossPhases === null) {
    data.bossPhases = Prisma.DbNull;
  }
  if ("metadata" in data && data.metadata === null) {
    data.metadata = Prisma.DbNull;
  }
  if ("expiresAtRound" in data && data.expiresAtRound === undefined) {
    data.expiresAtRound = null;
  }
  return data;
}

async function applyUpdate(
  tx: Tx,
  combatId: string,
  entity: "combat" | "combatant" | "effect",
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const data = toPrismaData(fields);
  if (entity === "combat") {
    await tx.combat.update({ where: { id: combatId }, data: data as never });
    return;
  }
  const result =
    entity === "combatant"
      ? await tx.combatant.updateMany({
          where: { id, combatId },
          data: data as never,
        })
      : await tx.combatEffect.updateMany({
          where: { id, combatId },
          data: data as never,
        });
  if (result.count !== 1) {
    throw new InvalidCombatStateError(`${entity} ${id} no longer exists`);
  }
}

async function applyChanges(
  tx: Tx,
  combatId: string,
  changes: Change[],
): Promise<void> {
  for (const change of changes) {
    if (change.kind === "update") {
      await applyUpdate(tx, combatId, change.entity, change.id, change.after);
    }
  }
}

// ---- Command runner --------------------------------------------------------

type Base = {
  combatId: string;
  expectedVersion: number;
  idempotencyKey?: string;
};

/**
 * Runs one command atomically: a guarded version bump (which also serialises
 * concurrent commands on the same combat), the state changes, and the event.
 */
async function execute<T extends object>(
  db: LiveCombatDb,
  input: Base,
  allowed: CombatStatusValue[],
  run: (ctx: { tx: Tx; combat: CombatRow; now: Date }) => Promise<Outcome<T>>,
): Promise<CommandResult<T>> {
  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const duplicate = await tx.combatEvent.findFirst({
        where: {
          combatId: input.combatId,
          idempotencyKey: input.idempotencyKey,
        },
        select: { seq: true },
      });
      if (duplicate) {
        const current = await tx.combat.findFirst({
          where: { id: input.combatId },
          select: { version: true },
        });
        return {
          combatId: input.combatId,
          version: current?.version ?? input.expectedVersion,
          seq: duplicate.seq,
          replayed: true,
        } as CommandResult<T>;
      }
    }

    const bumped = await tx.combat.updateMany({
      where: {
        id: input.combatId,
        version: input.expectedVersion,
        ...alive,
      },
      data: { version: { increment: 1 }, eventSeq: { increment: 1 } },
    });
    if (bumped.count === 0) {
      const exists = await tx.combat.findFirst({
        where: { id: input.combatId, ...alive },
        select: { id: true },
      });
      if (!exists) throw new CombatNotFoundError(input.combatId);
      throw new CombatConflictError(input.combatId, input.expectedVersion);
    }

    const combat = (await tx.combat.findFirstOrThrow({
      where: { id: input.combatId },
      select: {
        id: true,
        campaignId: true,
        encounterId: true,
        status: true,
        round: true,
        activeCombatantId: true,
        version: true,
        eventSeq: true,
        startedAt: true,
      },
    })) as CombatRow;
    if (!allowed.includes(combat.status)) {
      throw new InvalidCombatStateError(
        `This action is not allowed while the combat is ${combat.status}`,
      );
    }

    const outcome = await run({ tx, combat, now: new Date() });
    await applyChanges(tx, combat.id, outcome.changes);
    await tx.combatEvent.create({
      data: {
        combatId: combat.id,
        seq: combat.eventSeq,
        type: outcome.type,
        round: outcome.round ?? combat.round,
        actorCombatantId: outcome.actorId ?? null,
        targetCombatantId: outcome.targetId ?? null,
        summary: outcome.summary,
        payload: {
          schemaVersion: PAYLOAD_SCHEMA_VERSION,
          changes: outcome.changes,
          detail: outcome.detail ?? {},
        } as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return {
      combatId: combat.id,
      version: combat.version,
      seq: combat.eventSeq,
      replayed: false,
      ...(outcome.result ?? ({} as T)),
    };
  });
}

async function loadCombatants(tx: Tx, combatId: string): Promise<Combatant[]> {
  return tx.combatant.findMany({ where: { combatId } });
}

function findCombatant(list: Combatant[], id: string): Combatant {
  const found = list.find((c) => c.id === id);
  if (!found) throw new CombatantNotFoundError(id);
  return found;
}

/** If the active turn belonged to a combatant that stopped being active, move on. */
function pointerChange(
  combat: CombatRow,
  combatants: Combatant[],
): Change | null {
  if (combat.status !== "running" || !combat.activeCombatantId) return null;
  const active = combatants.find((c) => c.id === combat.activeCombatantId);
  if (active?.status === "active") return null;
  const next = nextTurn(
    { round: combat.round, activeCombatantId: combat.activeCombatantId },
    combatants,
  );
  return updateChange("combat", combat.id, combat, {
    round: next?.round ?? combat.round,
    activeCombatantId: next?.activeCombatantId ?? null,
  });
}

// ---- Combat creation -------------------------------------------------------

type EntryRow = Prisma.EncounterEntryGetPayload<object>;

/** Copies entries into combatants with frozen snapshots. Source records are only read. */
async function instantiateEntries(
  tx: Tx,
  combat: { id: string; campaignId: string },
  entries: EntryRow[],
  existingCount: number,
  tieBreakStart: number,
  rng: Rng | undefined,
): Promise<{ created: Combatant[]; rolled: number }> {
  const total = entries.reduce((sum, e) => sum + e.quantity, 0);
  if (existingCount + total > MAX_COMBATANTS) {
    throw new CombatLimitError(
      `A combat can have at most ${MAX_COMBATANTS} combatants`,
    );
  }
  const created: Combatant[] = [];
  let rolled = 0;
  let tieBreak = tieBreakStart;
  for (const entry of entries) {
    const resolved = await resolveCreature(
      {
        kind: entry.kind,
        label: entry.label,
        ruleEntryId: entry.ruleEntryId,
        npcId: entry.npcId,
        playerCharacterId: entry.playerCharacterId,
        overrides: entry.overrides,
      },
      combat.campaignId,
      tx,
    );
    const names = numberedNames(entry.label, entry.quantity);
    for (const name of names) {
      const overrides =
        entry.overrides && typeof entry.overrides === "object"
          ? (entry.overrides as { maxHp?: number })
          : {};
      const hp = chooseStartingHp(
        resolved.snapshot,
        entry.hpMode,
        overrides,
        rng,
      );
      if (hp.rolled) rolled += 1;
      created.push(
        await tx.combatant.create({
          data: {
            combatId: combat.id,
            kind: entry.kind,
            name,
            side: entry.side ?? DEFAULT_SIDE[entry.kind],
            isHidden: entry.startsHidden,
            wave: entry.wave,
            initiativeTieBreak: tieBreak++,
            maxHp: hp.maxHp,
            currentHp: hp.maxHp,
            armorClass: resolved.snapshot.armorClass,
            sourceRuleEntryId: resolved.ruleEntryId,
            sourceContentHash: resolved.contentHash,
            sourceNpcId: resolved.npcId,
            sourcePlayerCharacterId: resolved.playerCharacterId,
            statSnapshot: toSnapshotJson(resolved.snapshot),
            notes: resolved.notes ?? null,
          },
        }),
      );
    }
  }
  return { created, rolled };
}

function createChange(c: Combatant): Change {
  return {
    kind: "create",
    entity: "combatant",
    id: c.id,
    row: {
      name: c.name,
      side: c.side,
      wave: c.wave,
      maxHp: c.maxHp,
      armorClass: c.armorClass,
      isHidden: c.isHidden,
    },
  };
}

async function firstEvent(
  tx: Tx,
  combatId: string,
  summary: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await tx.combatEvent.create({
    data: {
      combatId,
      seq: 1,
      type: "combat_created",
      round: 1,
      summary,
      payload: {
        schemaVersion: PAYLOAD_SCHEMA_VERSION,
        changes: [],
        detail,
      } as Prisma.InputJsonValue,
    },
  });
}

/** Creates a live combat (status `setup`) from a planned encounter's wave-0 lineup. */
export async function createCombatFromEncounter(
  input: unknown,
  db: LiveCombatDb = getDb(),
  options: CommandOptions = {},
): Promise<{ combatId: string; version: number; combatantCount: number }> {
  const data = createCombatFromEncounterSchema.parse(input);
  return db.$transaction(async (tx) => {
    const encounter = await tx.encounter.findFirst({
      where: {
        id: data.encounterId,
        deletedAt: null,
        campaign: { deletedAt: null },
      },
      select: { id: true, title: true, campaignId: true },
    });
    if (!encounter) throw new EncounterNotFoundError(data.encounterId);
    // Row lock: a concurrent lineup edit or second launch waits for this transaction.
    await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${encounter.id} FOR UPDATE`;
    const open = await tx.combat.findFirst({
      where: { encounterId: encounter.id, status: { not: "ended" } },
      select: { id: true },
    });
    if (open) throw new EncounterInCombatError(encounter.id);

    const entries = await tx.encounterEntry.findMany({
      where: { encounterId: encounter.id, wave: 0 },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (entries.length === 0)
      throw new InvalidCombatStateError(
        "Add at least one starting combatant (wave 0) before launching",
      );
    const combat = await tx.combat.create({
      data: {
        campaignId: encounter.campaignId,
        encounterId: encounter.id,
        name: data.name ?? encounter.title,
        eventSeq: 1,
      },
      select: { id: true, campaignId: true, version: true },
    });
    const { created, rolled } = await instantiateEntries(
      tx,
      combat,
      entries,
      0,
      0,
      options.rng,
    );
    await firstEvent(tx, combat.id, "Combat created from encounter", {
      encounterId: encounter.id,
      combatantIds: created.map((c) => c.id),
      hpRolled: rolled,
    });
    return {
      combatId: combat.id,
      version: combat.version,
      combatantCount: created.length,
    };
  });
}

/** Creates an empty combat for a campaign, not linked to an encounter template. */
export async function createAdHocCombat(
  input: unknown,
  db: LiveCombatDb = getDb(),
): Promise<{ combatId: string; version: number }> {
  const data = createAdHocCombatSchema.parse(input);
  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { id: data.campaignId, deletedAt: null },
      select: { id: true },
    });
    if (!campaign) throw new CampaignNotFoundError(data.campaignId);
    const combat = await tx.combat.create({
      data: {
        campaignId: campaign.id,
        name: data.name ?? null,
        eventSeq: 1,
      },
      select: { id: true, version: true },
    });
    await firstEvent(tx, combat.id, "Ad hoc combat created", {});
    return { combatId: combat.id, version: combat.version };
  });
}

// ---- Commands --------------------------------------------------------------

export async function setInitiative(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.setInitiative.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status === "removed")
      throw new InvalidCombatStateError(
        "A removed combatant has no initiative",
      );
    const change = updateChange("combatant", target.id, target, {
      initiative: cmd.initiative,
      ...(cmd.tieBreak === undefined
        ? {}
        : { initiativeTieBreak: cmd.tieBreak }),
    });
    if (!change) throw new InvalidCombatStateError("Initiative is unchanged");
    return {
      type: "initiative_set",
      summary: `${target.name} initiative set to ${cmd.initiative ?? "none"}`,
      targetId: target.id,
      changes: [change],
      detail: { initiative: cmd.initiative, tieBreak: cmd.tieBreak ?? null },
    };
  });
}

/**
 * Rolls d20 + initiative modifier for the chosen combatants in one event.
 * Removed combatants are skipped; ones that already have a value are kept
 * unless `overwrite` is set. Existing tie-breaks are preserved.
 */
export async function rollInitiative(
  input: unknown,
  db: LiveCombatDb = getDb(),
  options: CommandOptions = {},
) {
  const cmd = commandSchemas.rollInitiative.parse(input);
  const rng = options.rng ?? Math.random;
  return execute<{ rolled: { id: string; initiative: number }[] }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const all = await loadCombatants(tx, combat.id);
      const changes: Change[] = [];
      const rolled: { id: string; initiative: number }[] = [];
      for (const id of new Set(cmd.combatantIds)) {
        const target = findCombatant(all, id);
        if (target.status === "removed") continue;
        if (target.initiative !== null && !cmd.overwrite) continue;
        const modifier =
          readSnapshot(target.statSnapshot)?.initiativeModifier ?? 0;
        const total = Math.floor(rng() * 20) + 1 + modifier;
        const initiative = Math.min(
          MAX_INITIATIVE,
          Math.max(MIN_INITIATIVE, total),
        );
        const change = updateChange("combatant", target.id, target, {
          initiative,
        });
        if (change) changes.push(change);
        rolled.push({ id: target.id, initiative });
      }
      if (changes.length === 0)
        throw new InvalidCombatStateError("Nothing to roll");
      return {
        type: "initiative_set",
        summary: `Rolled initiative for ${rolled.length} combatant${rolled.length === 1 ? "" : "s"}`,
        changes,
        detail: { rolled },
        result: { rolled },
      };
    },
  );
}

/** Jumps the turn to any active combatant without changing the round. */
export async function setActiveCombatant(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.setActiveCombatant.parse(input);
  return execute(db, cmd, ["running"], async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status !== "active")
      throw new InvalidCombatStateError(
        "Only a combatant that is in the fight can take the turn",
      );
    const change = updateChange("combat", combat.id, combat, {
      activeCombatantId: target.id,
    });
    if (!change)
      throw new InvalidCombatStateError("That combatant already has the turn");
    return {
      type: "turn_changed",
      summary: `${target.name}'s turn (selected)`,
      targetId: target.id,
      round: combat.round,
      changes: [change],
      detail: {
        direction: "select",
        from: {
          round: combat.round,
          activeCombatantId: combat.activeCombatantId,
        },
        to: { round: combat.round, activeCombatantId: target.id },
        dueEffectIds: [],
      },
    };
  });
}

/**
 * Moves a combatant one place up or down among combatants that share its
 * initiative by renumbering their tie-breaks (0, 1, 2, ...). It never changes
 * the initiative value itself.
 */
export async function moveInitiative(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.moveInitiative.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const all = await loadCombatants(tx, combat.id);
    const target = findCombatant(all, cmd.combatantId);
    if (target.status === "removed")
      throw new InvalidCombatStateError("A removed combatant has no order");
    const group = orderCombatants(
      all.filter(
        (c) => c.status !== "removed" && c.initiative === target.initiative,
      ),
    );
    const from = group.findIndex((c) => c.id === target.id);
    const to = cmd.direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= group.length)
      throw new InvalidCombatStateError(
        "No tied combatant to swap with in that direction",
      );
    [group[from], group[to]] = [group[to], group[from]];
    const changes = compact(
      group.map((c, index) =>
        updateChange("combatant", c.id, c, { initiativeTieBreak: index }),
      ),
    );
    return {
      type: "initiative_set",
      summary: `${target.name} moved ${cmd.direction} among tied combatants`,
      targetId: target.id,
      changes,
      detail: { direction: cmd.direction, initiative: target.initiative },
    };
  });
}

export type DueEffect = { id: string; name: string; targetId: string };

export async function advanceTurn(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.advanceTurn.parse(input);
  return execute<{ dueEffects: DueEffect[] }>(
    db,
    cmd,
    ["running"],
    async ({ tx, combat }) => {
      const combatants = await loadCombatants(tx, combat.id);
      const from: TurnPosition = {
        round: combat.round,
        activeCombatantId: combat.activeCombatantId,
      };
      const to =
        cmd.direction === "next"
          ? nextTurn(from, combatants)
          : previousTurn(from, combatants);
      if (!to) {
        throw new InvalidCombatStateError(
          cmd.direction === "next"
            ? "There are no active combatants"
            : "Already at the start of the combat",
        );
      }
      let dueEffects: DueEffect[] = [];
      if (cmd.direction === "next") {
        const effects = await tx.combatEffect.findMany({
          where: { combatId: combat.id, isActive: true },
        });
        dueEffects = findDueEffects(effects as EffectState[], {
          round: to.round,
          activeCombatantId: to.activeCombatantId,
          previous: from,
        }).map((e) => ({ id: e.id, name: e.name, targetId: e.targetId }));
      }
      const change = updateChange("combat", combat.id, combat, {
        round: to.round,
        activeCombatantId: to.activeCombatantId,
      });
      const name = combatants.find((c) => c.id === to.activeCombatantId)?.name;
      return {
        type: "turn_changed",
        summary:
          to.round !== combat.round
            ? `Round ${to.round}: ${name}'s turn`
            : `${name}'s turn`,
        targetId: to.activeCombatantId,
        round: to.round,
        changes: compact([change]),
        detail: {
          direction: cmd.direction,
          from,
          to,
          dueEffectIds: dueEffects.map((e) => e.id),
        },
        result: { dueEffects },
      };
    },
  );
}

export async function applyDamageCommand(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.damage.parse(input);
  return execute<{ concentrationPrompt: boolean }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const target = findCombatant(
        await loadCombatants(tx, combat.id),
        cmd.combatantId,
      );
      if (target.status === "removed")
        throw new InvalidCombatStateError(
          "A removed combatant cannot take damage",
        );
      const calculated = adjustDamage(cmd.amount, cmd.adjustment);
      const final = cmd.override ?? calculated;
      const result = applyDamage(target, final);
      const concentrating =
        (await tx.combatEffect.count({
          where: {
            combatId: combat.id,
            targetId: target.id,
            isActive: true,
            concentration: true,
          },
        })) > 0;
      const prompt =
        concentrating && result.absorbedByTemp + result.appliedToHp > 0;
      return {
        type: "damage",
        summary: `${target.name} takes ${final}${cmd.damageType ? ` ${cmd.damageType}` : ""} damage${
          cmd.override !== undefined && cmd.override !== calculated
            ? ` (DM override; calculated ${calculated})`
            : cmd.adjustment !== "none"
              ? ` (${cmd.amount} with ${cmd.adjustment})`
              : ""
        }`,
        targetId: target.id,
        changes: compact([
          updateChange("combatant", target.id, target, {
            currentHp: result.currentHp,
            tempHp: result.tempHp,
          }),
        ]),
        detail: {
          ...result,
          requested: cmd.amount,
          adjustment: cmd.adjustment,
          calculated,
          final,
          overridden: cmd.override !== undefined && cmd.override !== calculated,
          damageType: cmd.damageType ?? null,
          note: cmd.note || null,
          ...(cmd.roll ? { roll: cmd.roll } : {}),
        },
        result: { concentrationPrompt: prompt },
      };
    },
  );
}

export async function applyHealCommand(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.heal.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status === "removed")
      throw new InvalidCombatStateError("A removed combatant cannot be healed");
    const result = applyHeal(target, cmd.amount);
    return {
      type: "heal",
      summary: `${target.name} heals ${result.healed}`,
      targetId: target.id,
      changes: compact([
        updateChange("combatant", target.id, target, {
          currentHp: result.currentHp,
        }),
      ]),
      detail: {
        requested: cmd.amount,
        healed: result.healed,
        wasted: result.wasted,
        note: cmd.note || null,
      },
    };
  });
}

/** Manual correction of current HP; never above max HP (raise max HP first). */
export async function setCurrentHp(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.setCurrentHp.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status === "removed")
      throw new InvalidCombatStateError("A removed combatant cannot change HP");
    if (cmd.value > target.maxHp)
      throw new InvalidCombatStateError(
        `Current HP cannot exceed max HP (${target.maxHp}); raise max HP first`,
      );
    const change = updateChange("combatant", target.id, target, {
      currentHp: cmd.value,
    });
    if (!change) throw new InvalidCombatStateError("Current HP is unchanged");
    return {
      type: "combatant_updated",
      summary: `${target.name} HP set ${target.currentHp} → ${cmd.value} (manual)`,
      targetId: target.id,
      changes: [change],
      detail: {
        kind: "hp_set",
        from: target.currentHp,
        to: cmd.value,
        note: cmd.note || null,
      },
    };
  });
}

export async function setTempHp(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.setTempHp.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status === "removed")
      throw new InvalidCombatStateError(
        "A removed combatant cannot gain temp HP",
      );
    const tempHp = applyTempHp(target.tempHp, cmd.value, cmd.mode);
    const change = updateChange("combatant", target.id, target, { tempHp });
    if (!change) throw new InvalidCombatStateError("Temporary HP is unchanged");
    return {
      type: "temp_hp_set",
      summary: `${target.name} temporary HP ${target.tempHp} → ${tempHp}`,
      targetId: target.id,
      changes: [change],
      detail: { requested: cmd.value, mode: cmd.mode, note: cmd.note || null },
    };
  });
}

export async function setMaxHp(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.setMaxHp.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status === "removed")
      throw new InvalidCombatStateError(
        "A removed combatant cannot change max HP",
      );
    const change = updateChange("combatant", target.id, target, {
      maxHp: cmd.maxHp,
      currentHp: Math.min(target.currentHp, cmd.maxHp),
    });
    if (!change) throw new InvalidCombatStateError("Max HP is unchanged");
    return {
      type: "max_hp_set",
      summary: `${target.name} max HP ${target.maxHp} → ${cmd.maxHp}`,
      targetId: target.id,
      changes: [change],
      detail: {},
    };
  });
}

export async function setVisibility(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.setVisibility.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    const change = updateChange("combatant", target.id, target, {
      isHidden: cmd.isHidden,
    });
    if (!change) throw new InvalidCombatStateError("Visibility is unchanged");
    return {
      type: "visibility_changed",
      summary: `${target.name} ${cmd.isHidden ? "hidden" : "revealed"}`,
      targetId: target.id,
      changes: [change],
      detail: { isHidden: cmd.isHidden },
    };
  });
}

export async function setDefeated(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.setDefeated.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const combatants = await loadCombatants(tx, combat.id);
    const target = findCombatant(combatants, cmd.combatantId);
    if (target.status === "removed")
      throw new InvalidCombatStateError("Restore the combatant first");
    const status = cmd.defeated ? "defeated" : "active";
    const change = updateChange("combatant", target.id, target, { status });
    if (!change) throw new InvalidCombatStateError("Status is unchanged");
    const updated = combatants.map((c) =>
      c.id === target.id ? { ...c, status } : c,
    ) as Combatant[];
    return {
      type: "combatant_updated",
      summary: `${target.name} ${cmd.defeated ? "defeated" : "back in the fight"}`,
      targetId: target.id,
      changes: compact([change, pointerChange(combat, updated)]),
      detail: { status },
    };
  });
}

export async function updateCombatant(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.updateCombatant.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    const after: Record<string, unknown> = {};
    if (cmd.name !== undefined) after.name = cmd.name;
    if (cmd.notes !== undefined) after.notes = cmd.notes;
    if (cmd.armorClass !== undefined) after.armorClass = cmd.armorClass;
    if (cmd.bossPhases !== undefined) after.bossPhases = cmd.bossPhases;
    if (cmd.currentPhase !== undefined) {
      const phases = (after.bossPhases ?? target.bossPhases) as
        unknown[] | null;
      if (cmd.currentPhase > 0 && (!phases || cmd.currentPhase > phases.length))
        throw new InvalidCombatStateError(
          "Phase is beyond the configured boss phases",
        );
      after.currentPhase = cmd.currentPhase;
    }
    const change = updateChange("combatant", target.id, target, after);
    if (!change) throw new InvalidCombatStateError("Nothing to update");
    return {
      type: "combatant_updated",
      summary: `${target.name} updated`,
      targetId: target.id,
      changes: [change],
      detail: { fields: Object.keys(after) },
    };
  });
}

export async function removeCombatant(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.removeCombatant.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat, now }) => {
    const combatants = await loadCombatants(tx, combat.id);
    const target = findCombatant(combatants, cmd.combatantId);
    if (target.status === "removed")
      throw new InvalidCombatStateError("Combatant is already removed");
    const effects = await tx.combatEffect.findMany({
      where: { combatId: combat.id, targetId: target.id, isActive: true },
    });
    const updated = combatants.map((c) =>
      c.id === target.id ? { ...c, status: "removed" as const } : c,
    );
    return {
      type: "combatant_removed",
      summary: `${target.name} removed from combat`,
      targetId: target.id,
      changes: compact([
        updateChange("combatant", target.id, target, { status: "removed" }),
        ...effects.map((e) =>
          updateChange("effect", e.id, e, {
            isActive: false,
            endedAt: now.toISOString(),
          }),
        ),
        pointerChange(combat, updated),
      ]),
      detail: { endedEffectIds: effects.map((e) => e.id) },
    };
  });
}

export async function restoreCombatant(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.restoreCombatant.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const target = findCombatant(
      await loadCombatants(tx, combat.id),
      cmd.combatantId,
    );
    if (target.status !== "removed")
      throw new InvalidCombatStateError("Combatant is not removed");
    return {
      type: "combatant_restored",
      summary: `${target.name} restored to combat`,
      targetId: target.id,
      changes: compact([
        updateChange("combatant", target.id, target, { status: "active" }),
      ]),
      detail: {},
    };
  });
}

export async function addCombatant(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.addCombatant.parse(input);
  return execute<{ combatantId: string }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const existing = await loadCombatants(tx, combat.id);
      if (existing.length >= MAX_COMBATANTS)
        throw new CombatLimitError(
          `A combat can have at most ${MAX_COMBATANTS} combatants`,
        );
      const snapshot: CreatureSnapshot = {
        schemaVersion: 1,
        kind: "custom",
        name: cmd.name,
        armorClass: cmd.armorClass,
        maxHp: cmd.maxHp,
        hpAverage: null,
        hpRoll: null,
        initiativeModifier: 0,
        speed: [],
        abilityScores: [],
        savingThrowsAndSkills: [],
        damageVulnerabilities: [],
        damageResistances: [],
        damageImmunities: [],
        conditionImmunities: [],
        senses: [],
        languages: [],
        challengeRating: null,
        experience: null,
        sections: [],
        attacks: [],
        source: null,
      };
      const created = await tx.combatant.create({
        data: {
          combatId: combat.id,
          kind: "custom",
          name: cmd.name,
          side: cmd.side,
          isHidden: cmd.isHidden,
          initiative: cmd.initiative ?? null,
          initiativeTieBreak:
            existing.reduce(
              (max, c) => Math.max(max, c.initiativeTieBreak),
              -1,
            ) + 1,
          maxHp: cmd.maxHp,
          currentHp: cmd.maxHp,
          armorClass: cmd.armorClass,
          statSnapshot: toSnapshotJson(snapshot),
          notes: cmd.notes,
        },
      });
      return {
        type: "combatant_added",
        summary: `${cmd.name} joins the combat`,
        targetId: created.id,
        changes: [createChange(created)],
        detail: {},
        result: { combatantId: created.id },
      };
    },
  );
}

/** Brings a campaign player character into an open combat with a fresh snapshot. */
export async function addPlayerCharacter(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.addPlayerCharacter.parse(input);
  return execute<{ combatantId: string }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const existing = await loadCombatants(tx, combat.id);
      if (existing.length >= MAX_COMBATANTS)
        throw new CombatLimitError(
          `A combat can have at most ${MAX_COMBATANTS} combatants`,
        );
      if (
        existing.some(
          (c) => c.sourcePlayerCharacterId === cmd.playerCharacterId,
        )
      )
        throw new InvalidCombatStateError(
          "That player character is already in this combat",
        );
      const resolved = await resolveCreature(
        {
          kind: "player_character",
          label: "",
          ruleEntryId: null,
          npcId: null,
          playerCharacterId: cmd.playerCharacterId,
          overrides: {},
        },
        combat.campaignId,
        tx,
      );
      const created = await tx.combatant.create({
        data: {
          combatId: combat.id,
          kind: "player_character",
          name: resolved.snapshot.name,
          side: "party",
          isHidden: cmd.isHidden,
          initiative: cmd.initiative ?? null,
          initiativeTieBreak:
            existing.reduce(
              (max, c) => Math.max(max, c.initiativeTieBreak),
              -1,
            ) + 1,
          maxHp: resolved.snapshot.maxHp,
          currentHp: resolved.snapshot.maxHp,
          armorClass: resolved.snapshot.armorClass,
          sourcePlayerCharacterId: resolved.playerCharacterId,
          statSnapshot: toSnapshotJson(resolved.snapshot),
          notes: resolved.notes ?? null,
        },
      });
      return {
        type: "combatant_added",
        summary: `${created.name} joins the combat`,
        targetId: created.id,
        changes: [createChange(created)],
        detail: {},
        result: { combatantId: created.id },
      };
    },
  );
}

/** Instantiates a reinforcement wave from the encounter template. */
export async function addWave(
  input: unknown,
  db: LiveCombatDb = getDb(),
  options: CommandOptions = {},
) {
  const cmd = commandSchemas.addWave.parse(input);
  return execute<{ combatantIds: string[] }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      if (!combat.encounterId)
        throw new InvalidCombatStateError(
          "An ad hoc combat has no reinforcement waves",
        );
      const existing = await loadCombatants(tx, combat.id);
      if (existing.some((c) => c.wave === cmd.wave))
        throw new InvalidCombatStateError(`Wave ${cmd.wave} was already added`);
      const entries = await tx.encounterEntry.findMany({
        where: { encounterId: combat.encounterId, wave: cmd.wave },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (entries.length === 0)
        throw new InvalidCombatStateError(`Wave ${cmd.wave} has no entries`);
      const tieBreak =
        existing.reduce((max, c) => Math.max(max, c.initiativeTieBreak), -1) +
        1;
      const { created } = await instantiateEntries(
        tx,
        combat,
        entries,
        existing.length,
        tieBreak,
        options.rng,
      );
      return {
        type: "combatant_added",
        summary: `Reinforcement wave ${cmd.wave}: ${created.length} joined`,
        changes: created.map(createChange),
        detail: { wave: cmd.wave },
        result: { combatantIds: created.map((c) => c.id) },
      };
    },
  );
}

export async function addEffect(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = effectInputSchema.parse(input);
  return execute<{ effectId: string; warnings: string[] }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const combatants = await loadCombatants(tx, combat.id);
      const target = findCombatant(combatants, cmd.targetId);
      if (target.status === "removed")
        throw new InvalidCombatStateError(
          "A removed combatant cannot gain effects",
        );
      if (cmd.sourceCombatantId)
        findCombatant(combatants, cmd.sourceCombatantId);

      let name = cmd.name;
      if (cmd.conditionIndex) {
        const condition = await tx.ruleEntry.findFirst({
          where: {
            category: "conditions",
            sourceKey: cmd.conditionIndex,
            isActive: true,
          },
          select: { name: true },
        });
        if (!condition)
          throw new InvalidCombatStateError(
            `Unknown library condition: ${cmd.conditionIndex}`,
          );
        name = condition.name;
        const duplicate = await tx.combatEffect.count({
          where: {
            targetId: target.id,
            conditionIndex: cmd.conditionIndex,
            sourceCombatantId: cmd.sourceCombatantId ?? null,
            isActive: true,
          },
        });
        if (duplicate > 0) throw new DuplicateEffectError(name);
      }
      const active = await tx.combatEffect.count({
        where: { targetId: target.id, isActive: true },
      });
      if (active >= MAX_EFFECTS_PER_COMBATANT)
        throw new CombatLimitError(
          `A combatant can have at most ${MAX_EFFECTS_PER_COMBATANT} active effects`,
        );

      const timed = cmd.durationRounds != null;
      const created = await tx.combatEffect.create({
        data: {
          combatId: combat.id,
          targetId: target.id,
          sourceCombatantId: cmd.sourceCombatantId ?? null,
          kind: cmd.kind,
          name,
          conditionIndex: cmd.conditionIndex ?? null,
          note: cmd.note,
          concentration: cmd.concentration,
          startedRound: combat.round,
          expiresAtRound: timed ? combat.round + cmd.durationRounds! : null,
          expiryTrigger: cmd.expiryTrigger,
          metadata: cmd.metadata ?? Prisma.DbNull,
        },
      });

      // Informational only: the DM decides what an immunity or a second concentration means.
      const warnings: string[] = [];
      if (cmd.concentration && cmd.sourceCombatantId) {
        const other = await tx.combatEffect.findFirst({
          where: {
            combatId: combat.id,
            isActive: true,
            concentration: true,
            sourceCombatantId: cmd.sourceCombatantId,
            id: { not: created.id },
          },
        });
        if (other)
          warnings.push(
            `The source is already concentrating on ${other.name}; the DM decides whether that effect ends`,
          );
      }
      const snapshot = readSnapshot(target.statSnapshot);
      if (
        snapshot?.conditionImmunities.some(
          (immune) => immune.toLowerCase() === name.toLowerCase(),
        )
      ) {
        warnings.push(`${target.name} is listed as immune to ${name}`);
      }
      return {
        type: "effect_added",
        summary: `${name} on ${target.name}`,
        targetId: target.id,
        actorId: cmd.sourceCombatantId ?? null,
        changes: [
          {
            kind: "create",
            entity: "effect",
            id: created.id,
            row: { name, kind: cmd.kind, targetId: target.id },
          },
        ],
        detail: { warnings },
        result: { effectId: created.id, warnings },
      };
    },
  );
}

export async function removeEffect(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.removeEffect.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat, now }) => {
    const effect = await tx.combatEffect.findFirst({
      where: { id: cmd.effectId, combatId: combat.id, isActive: true },
    });
    if (!effect) throw new EffectNotFoundError(cmd.effectId);
    const verb =
      cmd.resolution === "resolved"
        ? "resolved"
        : cmd.resolution === "expired"
          ? "expired"
          : "ended";
    return {
      type: "effect_removed",
      summary: `${effect.name} ${verb}`,
      targetId: effect.targetId,
      changes: compact([
        updateChange("effect", effect.id, effect, {
          isActive: false,
          endedAt: now.toISOString(),
        }),
      ]),
      detail: { resolution: cmd.resolution, note: cmd.note },
    };
  });
}

/** Edits or extends an active effect. Logged as combatant_updated (kind "effect_updated"); undoable. */
export async function updateEffect(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.updateEffect.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat }) => {
    const effect = await tx.combatEffect.findFirst({
      where: { id: cmd.effectId, combatId: combat.id, isActive: true },
    });
    if (!effect) throw new EffectNotFoundError(cmd.effectId);

    const after: Record<string, unknown> = {};
    if (cmd.name !== undefined) {
      if (effect.conditionIndex && cmd.name !== effect.name)
        throw new InvalidCombatStateError(
          "A library condition keeps its name; add a note instead",
        );
      after.name = cmd.name;
    }
    if (cmd.note !== undefined) after.note = cmd.note === "" ? null : cmd.note;
    if (cmd.concentration !== undefined)
      after.concentration = cmd.concentration;
    if (cmd.metadata !== undefined) after.metadata = cmd.metadata;

    let expiresAtRound = effect.expiresAtRound;
    let trigger = cmd.expiryTrigger ?? effect.expiryTrigger;
    if (cmd.extendRounds !== undefined) {
      if (expiresAtRound === null || trigger === "none")
        throw new InvalidCombatStateError(
          "Only a timed effect can be extended; set an expiry first",
        );
      expiresAtRound += cmd.extendRounds;
    } else if (cmd.expiresAtRound !== undefined) {
      expiresAtRound = cmd.expiresAtRound;
    }
    if (expiresAtRound === null) trigger = "none";
    else if (trigger === "none")
      throw new InvalidCombatStateError(
        "A timed effect needs an expiry trigger",
      );
    if (trigger.endsWith("source_turn") && !effect.sourceCombatantId)
      throw new InvalidCombatStateError(
        "A source-turn expiry needs a source combatant",
      );
    after.expiresAtRound = expiresAtRound;
    after.expiryTrigger = trigger;

    const change = updateChange(
      "effect",
      effect.id,
      effect as unknown as Record<string, unknown>,
      after,
    );
    if (!change)
      throw new InvalidCombatStateError("Nothing changed on that effect");
    return {
      type: "combatant_updated",
      summary: `${effect.name} updated`,
      targetId: effect.targetId,
      changes: [change],
      detail: {
        kind: "effect_updated",
        extendRounds: cmd.extendRounds ?? null,
      },
    };
  });
}

export async function addNote(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.addNote.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async () => ({
    type: "note",
    summary: cmd.text,
    changes: [],
    detail: cmd.roll ? { roll: cmd.roll } : {},
  }));
}

/** Starts (setup -> running), pauses, or resumes a combat. */
export async function setCombatStatus(
  input: unknown,
  db: LiveCombatDb = getDb(),
) {
  const cmd = commandSchemas.setCombatStatus.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat, now }) => {
    if (!canTransitionCombat(combat.status, cmd.to))
      throw new InvalidCombatStateError(
        `Cannot change combat from ${combat.status} to ${cmd.to}`,
      );
    const after: Record<string, unknown> = { status: cmd.to };
    let first: string | null = null;
    if (combat.status === "setup") {
      const combatants = await loadCombatants(tx, combat.id);
      const active = turnOrder(combatants);
      if (active.length === 0)
        throw new InvalidCombatStateError("Add at least one combatant first");
      if (
        !cmd.allowMissingInitiative &&
        active.some((c) => c.initiative === null)
      )
        throw new InvalidCombatStateError(
          "Every combatant needs an initiative before the combat starts",
        );
      first = active[0].id;
      Object.assign(after, {
        round: 1,
        activeCombatantId: first,
        startedAt: now.toISOString(),
      });
    }
    return {
      type: "combat_status_changed",
      summary:
        combat.status === "setup"
          ? "Combat started"
          : cmd.to === "paused"
            ? "Combat paused"
            : "Combat resumed",
      targetId: first,
      changes: compact([updateChange("combat", combat.id, combat, after)]),
      detail: { from: combat.status, to: cmd.to },
    };
  });
}

/** Ends the combat and resolves the linked encounter. Not undoable. */
export async function endCombat(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.endCombat.parse(input);
  return execute(db, cmd, OPEN_STATUSES, async ({ tx, combat, now }) => {
    await tx.combat.update({
      where: { id: combat.id },
      data: { status: "ended", endedAt: now },
    });
    return {
      type: "combat_ended",
      summary: "Combat ended",
      changes: [],
      detail: { round: combat.round },
    };
  });
}

// ---- Undo ------------------------------------------------------------------

/** Reverses the most recent event that has not been undone. */
export async function undoLast(input: unknown, db: LiveCombatDb = getDb()) {
  const cmd = commandSchemas.undoLast.parse(input);
  return execute<{ undoneSeq: number }>(
    db,
    cmd,
    OPEN_STATUSES,
    async ({ tx, combat }) => {
      const target = await tx.combatEvent.findFirst({
        where: {
          combatId: combat.id,
          undoneBySeq: null,
          type: { notIn: ["undo", "combat_created", "combat_ended"] },
          seq: { lt: combat.eventSeq },
        },
        orderBy: { seq: "desc" },
      });
      if (!target) throw new NothingToUndoError();
      const payload = eventPayloadSchema.safeParse(target.payload);
      if (!payload.success)
        throw new InvalidCombatStateError(
          `Event ${target.seq} has an unreadable payload and cannot be undone`,
        );
      const inverse = invertChanges(payload.data.changes);

      if (!cmd.force) {
        for (const change of inverse) {
          if (change.kind !== "update") continue;
          const current =
            change.entity === "combat"
              ? await tx.combat.findFirst({ where: { id: combat.id } })
              : change.entity === "combatant"
                ? await tx.combatant.findFirst({
                    where: { id: change.id, combatId: combat.id },
                  })
                : await tx.combatEffect.findFirst({
                    where: { id: change.id, combatId: combat.id },
                  });
          if (
            !current ||
            !matchesExpected(current as Record<string, unknown>, change.before)
          )
            throw new UndoConflictError(target.seq);
        }
      }

      for (const change of inverse) {
        if (change.kind === "update") {
          await applyUpdate(
            tx,
            combat.id,
            change.entity,
            change.id,
            change.after,
          );
        } else if (change.entity === "combatant") {
          await tx.combatant.deleteMany({
            where: { id: change.id, combatId: combat.id },
          });
        } else {
          await tx.combatEffect.deleteMany({
            where: { id: change.id, combatId: combat.id },
          });
        }
      }
      await tx.combatEvent.update({
        where: { id: target.id },
        data: { undoneBySeq: combat.eventSeq },
      });
      return {
        type: "undo",
        summary: `Undid: ${target.summary}`,
        changes: [],
        detail: { targetSeq: target.seq, targetType: target.type },
        result: { undoneSeq: target.seq },
      };
    },
  );
}

// ---- Reads -----------------------------------------------------------------

export type CombatantView = {
  id: string;
  kind: CreatureKindValue;
  name: string;
  side: CombatSideValue;
  status: Combatant["status"];
  isHidden: boolean;
  wave: number;
  sourcePlayerCharacterId: string | null;
  initiative: number | null;
  initiativeTieBreak: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  notes: string | null;
  bossPhases: unknown[] | null;
  currentPhase: number;
  snapshot: CreatureSnapshot | null;
};

export type EffectView = Pick<
  CombatEffect,
  | "id"
  | "targetId"
  | "sourceCombatantId"
  | "kind"
  | "name"
  | "conditionIndex"
  | "note"
  | "concentration"
  | "startedRound"
  | "expiresAtRound"
  | "expiryTrigger"
> & { metadata: EffectMetadata | null };

export type CombatView = {
  id: string;
  campaignId: string;
  encounterId: string | null;
  name: string | null;
  status: CombatStatusValue;
  round: number;
  activeCombatantId: string | null;
  version: number;
  startedAt: Date | null;
  endedAt: Date | null;
  updatedAt: Date;
  combatants: CombatantView[];
  turnOrder: string[];
  effects: EffectView[];
};

export async function getCombat(
  combatId: string,
  db: LiveCombatDb = getDb(),
): Promise<CombatView | null> {
  const id = idSchema.parse(combatId);
  const combat = await db.combat.findFirst({
    where: { id, ...alive },
    include: {
      combatants: true,
      effects: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!combat) return null;
  const ordered = orderCombatants(combat.combatants);
  return {
    id: combat.id,
    campaignId: combat.campaignId,
    encounterId: combat.encounterId,
    name: combat.name,
    status: combat.status,
    round: combat.round,
    activeCombatantId: combat.activeCombatantId,
    version: combat.version,
    startedAt: combat.startedAt,
    endedAt: combat.endedAt,
    updatedAt: combat.updatedAt,
    combatants: ordered.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      side: c.side,
      status: c.status,
      isHidden: c.isHidden,
      wave: c.wave,
      sourcePlayerCharacterId: c.sourcePlayerCharacterId,
      initiative: c.initiative,
      initiativeTieBreak: c.initiativeTieBreak,
      maxHp: c.maxHp,
      currentHp: c.currentHp,
      tempHp: c.tempHp,
      armorClass: c.armorClass,
      notes: c.notes,
      bossPhases: Array.isArray(c.bossPhases) ? c.bossPhases : null,
      currentPhase: c.currentPhase,
      snapshot: readSnapshot(c.statSnapshot),
    })),
    turnOrder: turnOrder(combat.combatants).map((c) => c.id),
    effects: combat.effects.map((e) => ({
      id: e.id,
      targetId: e.targetId,
      sourceCombatantId: e.sourceCombatantId,
      kind: e.kind,
      name: e.name,
      conditionIndex: e.conditionIndex,
      note: e.note,
      concentration: e.concentration,
      startedRound: e.startedRound,
      expiresAtRound: e.expiresAtRound,
      expiryTrigger: e.expiryTrigger,
      metadata: readEffectMetadata(e.metadata),
    })),
  };
}

function readEffectMetadata(value: unknown): EffectMetadata | null {
  const parsed = effectMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Player-safe projection: hidden combatants, their effects, and stat internals are removed. */
export function toViewerView(view: CombatView): CombatView {
  const hidden = new Set(
    view.combatants.filter((c) => c.isHidden).map((c) => c.id),
  );
  return {
    ...view,
    activeCombatantId:
      view.activeCombatantId && hidden.has(view.activeCombatantId)
        ? null
        : view.activeCombatantId,
    combatants: view.combatants
      .filter((c) => !hidden.has(c.id))
      .map((c) => ({ ...c, snapshot: null, notes: null, bossPhases: null })),
    turnOrder: view.turnOrder.filter((id) => !hidden.has(id)),
    effects: view.effects
      .filter((e) => !hidden.has(e.targetId))
      .map((e) => ({
        ...e,
        sourceCombatantId:
          e.sourceCombatantId && hidden.has(e.sourceCombatantId)
            ? null
            : e.sourceCombatantId,
        note: null,
        metadata: null,
      })),
  };
}

const VIEWER_EVENT_TYPES = new Set([
  "turn_changed",
  "combat_status_changed",
  "combat_ended",
]);

/**
 * Player-safe log: event summaries embed names, HP and notes, so only turn and
 * status events that involve no hidden combatant are ever passed through.
 */
export function toViewerEvents(
  events: CombatEventView[],
  view: CombatView,
): CombatEventView[] {
  const hidden = new Set(
    view.combatants.filter((c) => c.isHidden).map((c) => c.id),
  );
  return events
    .filter(
      (e) =>
        VIEWER_EVENT_TYPES.has(e.type) &&
        !e.undone &&
        !(e.actorCombatantId && hidden.has(e.actorCombatantId)) &&
        !(e.targetCombatantId && hidden.has(e.targetCombatantId)),
    )
    .map((e) => ({ ...e, roll: null }));
}

export type CombatEventView = {
  seq: number;
  type: string;
  round: number;
  summary: string;
  actorCombatantId: string | null;
  targetCombatantId: string | null;
  undone: boolean;
  createdAt: Date;
  /** Whether the result was calculated by the app, typed in, or overridden. */
  origin: EventOrigin;
  roll: RollDetail | null;
};

export type EventOrigin = "calculated" | "manual" | "override" | null;

/** Classifies how an event's numbers came about, from its stored detail. */
export function eventOrigin(type: string, detail: unknown): EventOrigin {
  const d = (detail && typeof detail === "object" ? detail : {}) as Record<
    string,
    unknown
  >;
  switch (type) {
    case "damage":
      if (d.overridden === true) return "override";
      if (d.roll) {
        const roll = rollDetailSchema.safeParse(d.roll);
        return roll.success && roll.data.overrides.length > 0
          ? "override"
          : "calculated";
      }
      return "manual";
    case "heal":
    case "temp_hp_set":
    case "max_hp_set":
      return "manual";
    case "initiative_set":
      return Array.isArray(d.rolled) ? "calculated" : "manual";
    case "note": {
      const roll = rollDetailSchema.safeParse(d.roll);
      if (!roll.success) return null;
      return roll.data.overrides.length > 0 ? "override" : "calculated";
    }
    default:
      return null;
  }
}

export const EVENT_FILTERS = [
  "all",
  "hp",
  "rolls",
  "turns",
  "initiative",
  "effects",
  "combatants",
  "notes",
  "undo",
] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

const FILTER_TYPES: Record<
  Exclude<EventFilter, "all" | "rolls">,
  CombatEventTypeValue[]
> = {
  hp: ["damage", "heal", "temp_hp_set", "max_hp_set"],
  turns: [
    "turn_changed",
    "combat_status_changed",
    "combat_created",
    "combat_ended",
  ],
  initiative: ["initiative_set"],
  effects: ["effect_added", "effect_removed"],
  combatants: [
    "combatant_added",
    "combatant_removed",
    "combatant_restored",
    "visibility_changed",
    "combatant_updated",
  ],
  notes: ["note"],
  undo: ["undo"],
};

export async function listCombatEvents(
  combatId: string,
  options: {
    limit?: number;
    beforeSeq?: number;
    filter?: EventFilter;
    combatantId?: string;
  } = {},
  db: LiveCombatDb = getDb(),
): Promise<CombatEventView[]> {
  const id = idSchema.parse(combatId);
  const limit = z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .parse(options.limit);
  const combat = await db.combat.findFirst({
    where: { id, ...alive },
    select: { id: true },
  });
  if (!combat) throw new CombatNotFoundError(id);
  const filter = options.filter ?? "all";
  const types =
    filter === "all"
      ? undefined
      : filter === "rolls"
        ? ["damage", "note"]
        : FILTER_TYPES[filter];
  const rows = await db.combatEvent.findMany({
    where: {
      combatId: id,
      ...(options.beforeSeq ? { seq: { lt: options.beforeSeq } } : {}),
      ...(types ? { type: { in: types as CombatEventTypeValue[] } } : {}),
      ...(options.combatantId
        ? {
            OR: [
              { actorCombatantId: options.combatantId },
              { targetCombatantId: options.combatantId },
            ],
          }
        : {}),
    },
    orderBy: { seq: "desc" },
    take: filter === "rolls" ? 500 : limit,
  });
  const views = rows.map((e) => {
    const detail = (e.payload as { detail?: unknown } | null)?.detail;
    const roll = rollDetailSchema.safeParse(
      (detail as { roll?: unknown } | undefined)?.roll,
    );
    return {
      seq: e.seq,
      type: e.type,
      round: e.round,
      summary: e.summary,
      actorCombatantId: e.actorCombatantId,
      targetCombatantId: e.targetCombatantId,
      undone: e.undoneBySeq !== null,
      createdAt: e.createdAt,
      origin: eventOrigin(e.type, detail),
      roll: roll.success ? roll.data : null,
    };
  });
  return (filter === "rolls" ? views.filter((v) => v.roll) : views).slice(
    0,
    limit,
  );
}

/** Ended combats keep their full history and stay readable. */
export async function listRecentEndedCombats(
  db: LiveCombatDb = getDb(),
  take = 10,
) {
  return db.combat.findMany({
    where: { status: "ended", ...alive },
    orderBy: { endedAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      round: true,
      endedAt: true,
      encounter: { select: { title: true } },
      campaign: { select: { name: true } },
    },
  });
}

export async function listOpenCombats(
  campaignId: string,
  db: LiveCombatDb = getDb(),
) {
  const id = idSchema.parse(campaignId);
  return db.combat.findMany({
    where: { campaignId: id, status: { not: "ended" }, ...alive },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      round: true,
      encounterId: true,
    },
  });
}

/** Unfinished combats across all campaigns, most recently active first. */
export async function listAllOpenCombats(db: LiveCombatDb = getDb()) {
  return db.combat.findMany({
    where: { status: { not: "ended" }, ...alive },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      status: true,
      round: true,
      updatedAt: true,
      encounter: { select: { title: true } },
      campaign: { select: { name: true } },
    },
  });
}
