import {
  CombatNotFoundError,
  InvalidCombatStateError,
  addNote,
  applyDamageCommand,
  getCombat,
  type CombatView,
  type LiveCombatDb,
} from "./live-combat";
import {
  buildResolution,
  overridesSchema,
  rollRecordSchema,
  type Overrides,
  type Party,
  type Resolution,
  type RollRecord,
} from "./resolution";

export function encodeRecord(record: RollRecord): string {
  return Buffer.from(JSON.stringify(record), "utf8").toString("base64url");
}

/** Returns null for anything that is not a valid roll record. */
export function decodeRecord(raw: string | undefined): RollRecord | null {
  if (!raw || raw.length > 8000) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const parsed = rollRecordSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function partiesFor(
  combat: CombatView,
  record: RollRecord,
): { actor: Party; subject: Party } | null {
  const toParty = (id: string): Party | null => {
    const c = combat.combatants.find((x) => x.id === id);
    return c
      ? {
          id: c.id,
          name: c.name,
          armorClass: c.armorClass,
          snapshot: c.snapshot,
        }
      : null;
  };
  const actor = toParty(record.actorId);
  const subject = toParty(
    record.kind === "attack" ? record.targetId! : record.actorId,
  );
  return actor && subject ? { actor, subject } : null;
}

export function resolveFor(
  combat: CombatView,
  record: RollRecord,
  overrides: Overrides,
): Resolution | null {
  const parties = partiesFor(combat, record);
  return parties ? buildResolution(record, parties, overrides) : null;
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Recomputes the resolution on the server from the raw dice and the DM's
 * overrides, then applies it. HP only changes here, never while previewing.
 */
export async function confirmResolution(
  input: {
    combatId: string;
    expectedVersion: number;
    record: unknown;
    overrides: unknown;
  },
  db?: LiveCombatDb,
) {
  const record = rollRecordSchema.parse(input.record);
  const overrides = overridesSchema.parse(input.overrides);
  const combat = await getCombat(input.combatId, db);
  if (!combat) throw new CombatNotFoundError(input.combatId);
  const resolution = resolveFor(combat, record, overrides);
  if (!resolution)
    throw new InvalidCombatStateError("A combatant in this roll is gone");

  const extra = overrides.note ? ` (${overrides.note})` : "";
  const flags = [
    resolution.successOverridden && "result overridden",
    resolution.criticalOverridden && "critical overridden",
    resolution.finalOverridden && "total overridden",
  ].filter(Boolean);
  const text = truncate(
    `${resolution.summary}${flags.length ? ` [${flags.join(", ")}]` : ""}${extra}`,
    200,
  );

  const d = resolution.d20;
  const roll = {
    kind: resolution.kind,
    label: resolution.label,
    natural: d.natural,
    bonus: d.bonus,
    total: d.total,
    against:
      resolution.kind === "attack"
        ? `AC ${resolution.targetAc}`
        : `DC ${resolution.dc}`,
    verdict:
      resolution.kind === "attack"
        ? resolution.success
          ? resolution.critical
            ? "critical hit"
            : "hit"
          : "miss"
        : resolution.success
          ? "success"
          : "failure",
    manualDice: record.manual,
    overrides: flags as string[],
  };

  if (resolution.final > 0) {
    await applyDamageCommand(
      {
        combatId: input.combatId,
        expectedVersion: input.expectedVersion,
        combatantId: resolution.subject.id,
        amount: resolution.final,
        damageType:
          resolution.groups.length === 1 ? resolution.groups[0].type : null,
        adjustment: "none",
        note: text,
        roll,
      },
      db,
    );
    return { applied: resolution.final, resolution };
  }
  await addNote(
    {
      combatId: input.combatId,
      expectedVersion: input.expectedVersion,
      text,
      roll,
    },
    db,
  );
  return { applied: 0, resolution };
}
