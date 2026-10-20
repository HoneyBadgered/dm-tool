import { z } from "zod";
import {
  DAMAGE_ADJUSTMENTS,
  idSchema,
  type CreatureSnapshot,
  type DamageAdjustment,
} from "@/lib/validation/combat";
import {
  DiceInputError,
  countDice,
  distributeValues,
  doubleDice,
  evaluateTerms,
  formatEvaluation,
  parseExpression,
  type Evaluation,
  type Term,
} from "./expression";
import { adjustDamage, suggestAdjustment } from "./engine";

export const D20_MODES = ["normal", "advantage", "disadvantage"] as const;
export type D20Mode = (typeof D20_MODES)[number];
export const ROLL_KINDS = ["attack", "save", "check"] as const;
export type RollKind = (typeof ROLL_KINDS)[number];
export const MAX_DAMAGE_PARTS = 8;

/**
 * A completed roll, stored as raw dice only. Results are always recomputed from
 * these dice plus the DM's overrides, so a displayed total is never trusted.
 */
export const rollRecordSchema = z
  .object({
    v: z.literal(1),
    kind: z.enum(ROLL_KINDS),
    actorId: idSchema,
    // Attack target. Saves and checks apply to the actor.
    targetId: idSchema.nullable(),
    label: z.string().trim().min(1).max(80),
    bonus: z.number().int().min(-50).max(50),
    mode: z.enum(D20_MODES),
    d20: z.array(z.number().int().min(1).max(20)).min(1).max(2),
    manual: z.boolean(),
    dc: z.number().int().min(1).max(60).nullable(),
    halfOnSuccess: z.boolean(),
    damage: z
      .array(
        z.object({
          expr: z.string().trim().min(1).max(60),
          type: z.string().trim().min(1).max(40).nullable(),
          // Per dice term. Holds double the dice so a critical hit can use them all.
          rolls: z
            .array(z.array(z.number().int().min(1).max(1000)).max(200))
            .max(20),
        }),
      )
      .max(MAX_DAMAGE_PARTS),
  })
  .superRefine((v, ctx) => {
    if (v.d20.length !== (v.mode === "normal" ? 1 : 2))
      ctx.addIssue({
        code: "custom",
        message: "d20 count does not match mode",
      });
    if (v.kind === "attack" && !v.targetId)
      ctx.addIssue({ code: "custom", message: "An attack needs a target" });
    if (v.kind !== "attack" && v.dc === null)
      ctx.addIssue({ code: "custom", message: "A save or check needs a DC" });
    if (v.kind === "check" && v.damage.length > 0)
      ctx.addIssue({ code: "custom", message: "A check cannot deal damage" });
  });
export type RollRecord = z.output<typeof rollRecordSchema>;

export type Overrides = {
  hit?: "hit" | "miss";
  critical?: "critical" | "normal";
  success?: "success" | "failure";
  adjustments?: Record<string, DamageAdjustment>;
  final?: number;
  note?: string;
};

export const overridesSchema = z.object({
  hit: z.enum(["hit", "miss"]).optional(),
  critical: z.enum(["critical", "normal"]).optional(),
  success: z.enum(["success", "failure"]).optional(),
  adjustments: z.record(z.string(), z.enum(DAMAGE_ADJUSTMENTS)).optional(),
  final: z.number().int().min(0).max(100_000).optional(),
  note: z.string().trim().max(120).optional(),
});

// ---- Bonus lookups (never invented) ---------------------------------------

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export type BonusLookup = {
  bonus: number | null;
  basis: "listed" | "ability modifier" | "unknown";
};

export function savingThrowBonus(
  snapshot: CreatureSnapshot | null,
  ability: string,
): BonusLookup {
  return lookupBonus(snapshot, ability, `Saving Throw: ${ability}`);
}

export function checkBonus(
  snapshot: CreatureSnapshot | null,
  ability: string,
  skill?: string,
): BonusLookup {
  return lookupBonus(snapshot, ability, skill ? `Skill: ${skill}` : null);
}

function lookupBonus(
  snapshot: CreatureSnapshot | null,
  ability: string,
  listedName: string | null,
): BonusLookup {
  if (listedName) {
    const wanted = listedName.toLowerCase();
    for (const entry of snapshot?.savingThrowsAndSkills ?? []) {
      const match = /^(.*?)\s*([+-]\d+)$/.exec(entry);
      if (match && match[1].toLowerCase() === wanted)
        return { bonus: Number(match[2]), basis: "listed" };
    }
  }
  const score = snapshot?.abilityScores.find(
    (a) => a.label.toUpperCase() === ability.toUpperCase(),
  );
  return score
    ? { bonus: abilityModifier(score.value), basis: "ability modifier" }
    : { bonus: null, basis: "unknown" };
}

// ---- Making a roll ---------------------------------------------------------

export type DamageInput = {
  expr: string;
  type: string | null;
  manual?: number[] | null;
};

export function makeRollRecord(
  input: {
    kind: RollKind;
    actorId: string;
    targetId: string | null;
    label: string;
    bonus: number;
    mode: D20Mode;
    dc: number | null;
    halfOnSuccess: boolean;
    manualD20?: number[] | null;
    damage: DamageInput[];
  },
  rng: () => number = Math.random,
): RollRecord {
  const need = input.mode === "normal" ? 1 : 2;
  const manual = input.manualD20 != null && input.manualD20.length > 0;
  if (manual && input.manualD20!.length !== need)
    throw new DiceInputError(
      `Enter ${need} d20 result${need === 1 ? "" : "s"} for ${input.mode} (or leave blank to roll)`,
    );
  if (manual && input.manualD20!.some((v) => v < 1 || v > 20))
    throw new DiceInputError("d20 results must be from 1 to 20");
  const d20 = manual
    ? input.manualD20!
    : Array.from({ length: need }, () => Math.floor(rng() * 20) + 1);

  const damage = input.damage.map((part) => {
    const parsed = parseExpression(part.expr);
    if (!parsed.ok) throw new DiceInputError(`${part.expr}: ${parsed.error}`);
    const counts = countDice(parsed.terms);
    const total = counts.reduce((a, b) => a + b, 0);
    let rolls: number[][];
    if (part.manual && part.manual.length > 0) {
      if (part.manual.length === total * 2) {
        rolls = distributeValues(parsed.terms, part.manual, 1);
      } else {
        // Physical dice for the normal roll; extra critical dice are rolled here.
        const base = distributeValues(parsed.terms, part.manual);
        const dice = parsed.terms.filter(
          (t): t is Extract<Term, { kind: "dice" }> => t.kind === "dice",
        );
        rolls = base.map((r, i) => [
          ...r,
          ...Array.from(
            { length: dice[i].count },
            () => Math.floor(rng() * dice[i].sides) + 1,
          ),
        ]);
      }
    } else {
      rolls = evaluateTerms(doubleDice(parsed.terms), { rng }).rolls;
    }
    // Validate ranges once through the evaluator.
    evaluateTerms(doubleDice(parsed.terms), { rolls });
    return { expr: part.expr, type: part.type, rolls };
  });

  return rollRecordSchema.parse({
    v: 1,
    kind: input.kind,
    actorId: input.actorId,
    targetId: input.targetId,
    label: input.label,
    bonus: input.bonus,
    mode: input.mode,
    d20,
    manual,
    dc: input.dc,
    halfOnSuccess: input.halfOnSuccess,
    damage,
  });
}

// ---- Resolving a roll ------------------------------------------------------

export type Party = {
  id: string;
  name: string;
  armorClass: number;
  snapshot: CreatureSnapshot | null;
};

export type DamageGroup = {
  type: string | null;
  raw: number;
  afterOutcome: number;
  suggestion: DamageAdjustment;
  suggestionNotes: string[];
  suggestionCertain: boolean;
  adjustment: DamageAdjustment;
  adjusted: number;
};

export type Resolution = {
  kind: RollKind;
  label: string;
  actor: Party;
  /** Who takes the damage: the target of an attack, or the roller of a save. */
  subject: Party;
  d20: {
    values: number[];
    mode: D20Mode;
    natural: number;
    discarded: number | null;
    bonus: number;
    total: number;
  };
  targetAc: number | null;
  dc: number | null;
  automatic: "natural 20" | "natural 1" | null;
  success: boolean;
  successOverridden: boolean;
  critical: boolean;
  criticalOverridden: boolean;
  rulesNotes: string[];
  parts: { expr: string; type: string | null; evaluation: Evaluation }[];
  groups: DamageGroup[];
  calculated: number;
  final: number;
  finalOverridden: boolean;
  summary: string;
};

export function pickD20(values: number[], mode: D20Mode) {
  if (mode === "normal") return { natural: values[0], discarded: null };
  const high = Math.max(...values);
  const low = Math.min(...values);
  return mode === "advantage"
    ? { natural: high, discarded: low }
    : { natural: low, discarded: high };
}

function typeKey(type: string | null) {
  return type ? type.trim().toLowerCase() : "";
}

export function buildResolution(
  record: RollRecord,
  parties: { actor: Party; subject: Party },
  overrides: Overrides = {},
): Resolution {
  const { actor, subject } = parties;
  const { natural, discarded } = pickD20(record.d20, record.mode);
  const total = natural + record.bonus;
  const isAttack = record.kind === "attack";
  const rulesNotes: string[] = [];

  let automatic: Resolution["automatic"] = null;
  let calculatedSuccess: boolean;
  if (isAttack) {
    // Attack rolls only: a natural 20 hits and is a critical hit; a natural 1 misses.
    if (natural === 20) {
      automatic = "natural 20";
      calculatedSuccess = true;
    } else if (natural === 1) {
      automatic = "natural 1";
      calculatedSuccess = false;
    } else {
      calculatedSuccess = total >= subject.armorClass;
    }
    rulesNotes.push(
      "Natural 20 and natural 1 are applied to attack rolls only. This rule is from the printed 2024 rules; the imported library has no rule text for it, so confirm it for your table.",
    );
  } else {
    calculatedSuccess = total >= record.dc!;
    rulesNotes.push(
      "A natural 20 or natural 1 has no automatic effect on saving throws or ability checks here; the total is compared with the DC. Override the result if your ruling differs.",
    );
  }

  const success =
    overrides.hit !== undefined && isAttack
      ? overrides.hit === "hit"
      : overrides.success !== undefined && !isAttack
        ? overrides.success === "success"
        : calculatedSuccess;
  const successOverridden = success !== calculatedSuccess;

  const calculatedCritical = isAttack && natural === 20 && success;
  const critical = !isAttack
    ? false
    : success
      ? overrides.critical
        ? overrides.critical === "critical"
        : calculatedCritical
      : false;
  const criticalOverridden =
    isAttack && success && critical !== calculatedCritical;

  // Damage: dice recomputed from the stored raw dice.
  const parts = record.damage.map((part) => {
    const parsed = parseExpression(part.expr);
    if (!parsed.ok) throw new DiceInputError(`${part.expr}: ${parsed.error}`);
    const terms: Term[] = critical ? doubleDice(parsed.terms) : parsed.terms;
    const counts = countDice(parsed.terms);
    const rolls = critical
      ? part.rolls
      : part.rolls.map((r, i) => r.slice(0, counts[i]));
    return {
      expr: part.expr,
      type: part.type,
      evaluation: evaluateTerms(terms, { rolls }),
    };
  });
  if (critical && parts.length > 0)
    rulesNotes.push(
      "Critical hit: every damage die of the attack is rolled twice; modifiers are added once.",
    );

  const dealsDamage = isAttack ? success : true;
  const halve = !isAttack && success && record.halfOnSuccess;
  const noneOnSuccess = !isAttack && success && !record.halfOnSuccess;
  if (halve)
    rulesNotes.push(
      "Half damage on a success is applied before resistance or vulnerability. Override the final number if you rule otherwise.",
    );

  const byType = new Map<string, { type: string | null; raw: number }>();
  for (const part of parts) {
    const key = typeKey(part.type);
    const group = byType.get(key) ?? { type: part.type, raw: 0 };
    group.raw += part.evaluation.total;
    byType.set(key, group);
  }
  const groups: DamageGroup[] = [...byType.entries()].map(([key, group]) => {
    const raw = Math.max(0, group.raw);
    const afterOutcome =
      !dealsDamage || noneOnSuccess ? 0 : halve ? Math.floor(raw / 2) : raw;
    const suggestion = suggestAdjustment(subject.snapshot, group.type);
    const adjustment = overrides.adjustments?.[key] ?? suggestion.adjustment;
    return {
      type: group.type,
      raw,
      afterOutcome,
      suggestion: suggestion.adjustment,
      suggestionNotes: suggestion.notes,
      suggestionCertain: suggestion.certain,
      adjustment,
      adjusted: adjustDamage(afterOutcome, adjustment),
    };
  });
  const calculated = groups.reduce((sum, g) => sum + g.adjusted, 0);
  const final = overrides.final ?? calculated;

  const rollText =
    record.mode === "normal"
      ? `${natural}`
      : `${record.d20.join(" & ")} → ${natural}`;
  const against = isAttack ? `AC ${subject.armorClass}` : `DC ${record.dc}`;
  const verdict = isAttack
    ? success
      ? critical
        ? "critical hit"
        : "hit"
      : "miss"
    : success
      ? "success"
      : "failure";
  const summary = `${actor.name}: ${record.label}${isAttack ? ` vs ${subject.name}` : ""} — ${rollText}${record.bonus >= 0 ? "+" : "−"}${Math.abs(record.bonus)} = ${total} against ${against}: ${verdict}`;

  return {
    kind: record.kind,
    label: record.label,
    actor,
    subject,
    d20: {
      values: record.d20,
      mode: record.mode,
      natural,
      discarded,
      bonus: record.bonus,
      total,
    },
    targetAc: isAttack ? subject.armorClass : null,
    dc: record.dc,
    automatic,
    success,
    successOverridden,
    critical,
    criticalOverridden,
    rulesNotes,
    parts,
    groups,
    calculated,
    final,
    finalOverridden:
      overrides.final !== undefined && overrides.final !== calculated,
    summary,
  };
}

export { formatEvaluation };
