import type {
  Change,
  DamageAdjustment,
  CombatStatusValue,
  CombatantStatusValue,
  EffectExpiryTriggerValue,
  EffectMetadata,
} from "@/lib/validation/combat";

export type CombatantState = {
  id: string;
  name: string;
  initiative: number | null;
  initiativeTieBreak: number;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  status: CombatantStatusValue;
  isHidden: boolean;
};

export type TurnState = {
  status: CombatStatusValue;
  round: number;
  activeCombatantId: string | null;
};

export type EffectState = {
  id: string;
  targetId: string;
  sourceCombatantId: string | null;
  name: string;
  isActive: boolean;
  expiresAtRound: number | null;
  expiryTrigger: EffectExpiryTriggerValue;
};

/** Initiative descending (unrolled last), then manual tie-break ascending, then id. */
export function orderCombatants<T extends CombatantState>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ai = a.initiative ?? Number.NEGATIVE_INFINITY;
    const bi = b.initiative ?? Number.NEGATIVE_INFINITY;
    if (ai !== bi) return bi > ai ? 1 : -1;
    if (a.initiativeTieBreak !== b.initiativeTieBreak) {
      return a.initiativeTieBreak - b.initiativeTieBreak;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function turnOrder<T extends CombatantState>(list: T[]): T[] {
  return orderCombatants(list).filter((c) => c.status === "active");
}

export type TurnPosition = { round: number; activeCombatantId: string | null };

/**
 * Next active combatant after the current pointer. The pointer may reference a
 * combatant that is no longer active (defeated/removed); its position in the full
 * order is still used so the turn never jumps backwards.
 */
export function nextTurn(
  state: TurnPosition,
  combatants: CombatantState[],
): TurnPosition | null {
  const ordered = orderCombatants(combatants);
  if (!ordered.some((c) => c.status === "active")) return null;
  const current = ordered.findIndex((c) => c.id === state.activeCombatantId);
  for (let i = current + 1; i < ordered.length; i++) {
    if (ordered[i].status === "active") {
      return { round: state.round, activeCombatantId: ordered[i].id };
    }
  }
  const first = ordered.find((c) => c.status === "active")!;
  return { round: state.round + 1, activeCombatantId: first.id };
}

/** Previous active combatant; null at the very start of round 1. */
export function previousTurn(
  state: TurnPosition,
  combatants: CombatantState[],
): TurnPosition | null {
  const ordered = orderCombatants(combatants);
  const actives = ordered.filter((c) => c.status === "active");
  if (actives.length === 0) return null;
  const current = ordered.findIndex((c) => c.id === state.activeCombatantId);
  const start = current === -1 ? ordered.length : current;
  for (let i = start - 1; i >= 0; i--) {
    if (ordered[i].status === "active") {
      return { round: state.round, activeCombatantId: ordered[i].id };
    }
  }
  if (state.round <= 1) return null;
  return {
    round: state.round - 1,
    activeCombatantId: actives[actives.length - 1].id,
  };
}

export type DamageResult = {
  currentHp: number;
  tempHp: number;
  absorbedByTemp: number;
  appliedToHp: number;
  overkill: number;
};

/** Temp HP absorbs damage first; overkill is reported rather than lost. */
export function applyDamage(
  target: Pick<CombatantState, "currentHp" | "tempHp">,
  amount: number,
): DamageResult {
  const absorbedByTemp = Math.min(target.tempHp, amount);
  const remaining = amount - absorbedByTemp;
  const appliedToHp = Math.min(target.currentHp, remaining);
  return {
    currentHp: target.currentHp - appliedToHp,
    tempHp: target.tempHp - absorbedByTemp,
    absorbedByTemp,
    appliedToHp,
    overkill: remaining - appliedToHp,
  };
}

/** Resistance halves (rounded down), vulnerability doubles, immunity negates. Applied once. */
export function adjustDamage(
  amount: number,
  adjustment: DamageAdjustment,
): number {
  switch (adjustment) {
    case "resistance":
      return Math.floor(amount / 2);
    case "vulnerability":
      return amount * 2;
    case "immunity":
      return 0;
    default:
      return amount;
  }
}

export type AdjustmentSuggestion = {
  adjustment: DamageAdjustment;
  /** True only when the creature's data names the damage type exactly. */
  certain: boolean;
  notes: string[];
};

type DamageTraits = {
  damageResistances: string[];
  damageVulnerabilities: string[];
  damageImmunities: string[];
};

/**
 * Suggests, never decides. Only an exact entry (e.g. "Fire") is trusted; entries
 * that merely mention the type (e.g. "...from Nonmagical Attacks") are surfaced
 * as notes so the DM can judge the conditions.
 */
export function suggestAdjustment(
  traits: DamageTraits | null | undefined,
  damageType: string | null | undefined,
): AdjustmentSuggestion {
  const type = damageType?.trim().toLowerCase();
  if (!type) {
    return {
      adjustment: "none",
      certain: false,
      notes: ["No damage type given, so choose the adjustment yourself."],
    };
  }
  if (!traits) {
    return {
      adjustment: "none",
      certain: false,
      notes: ["No resistance data is stored for this combatant."],
    };
  }
  const pattern = new RegExp(
    `\\b${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  );
  const lists = [
    ["immunity", traits.damageImmunities],
    ["resistance", traits.damageResistances],
    ["vulnerability", traits.damageVulnerabilities],
  ] as const;
  const exact: DamageAdjustment[] = [];
  const notes: string[] = [];
  for (const [kind, entries] of lists) {
    for (const entry of entries) {
      const text = entry.trim().toLowerCase();
      if (text === type) exact.push(kind);
      else if (pattern.test(text)) {
        notes.push(
          `Listed as "${entry}" (${kind}); conditions apply, so you decide.`,
        );
      }
    }
  }
  if (exact.includes("immunity")) {
    return { adjustment: "immunity", certain: true, notes };
  }
  const hasResist = exact.includes("resistance");
  const hasVuln = exact.includes("vulnerability");
  if (hasResist && hasVuln) {
    notes.push("Both resistance and vulnerability are listed; you decide.");
    return { adjustment: "none", certain: false, notes };
  }
  if (hasResist) return { adjustment: "resistance", certain: true, notes };
  if (hasVuln) return { adjustment: "vulnerability", certain: true, notes };
  if (notes.length === 0) {
    notes.push(`No listed adjustment for ${type}.`);
  }
  return { adjustment: "none", certain: false, notes };
}

export type HealResult = { currentHp: number; healed: number; wasted: number };

export function applyHeal(
  target: Pick<CombatantState, "currentHp" | "maxHp">,
  amount: number,
): HealResult {
  const healed = Math.min(amount, target.maxHp - target.currentHp);
  return {
    currentHp: target.currentHp + healed,
    healed,
    wasted: amount - healed,
  };
}

export function applyTempHp(
  current: number,
  value: number,
  mode: "replace" | "keep_higher",
): number {
  return mode === "replace" ? value : Math.max(current, value);
}

/**
 * Effects whose expiry boundary has been reached. They are reported, never removed
 * automatically: the DM confirms the removal.
 */
export function findDueEffects(
  effects: EffectState[],
  context: {
    round: number;
    activeCombatantId: string | null;
    previous: TurnPosition | null;
  },
): EffectState[] {
  return effects.filter((effect) => {
    if (!effect.isActive || effect.expiresAtRound === null) return false;
    const trigger = effect.expiryTrigger;
    if (trigger === "none") return false;
    const owner = trigger.endsWith("source_turn")
      ? effect.sourceCombatantId
      : effect.targetId;
    if (!owner) return false;
    if (trigger.startsWith("start_of")) {
      return (
        context.activeCombatantId === owner &&
        context.round >= effect.expiresAtRound
      );
    }
    return (
      context.previous?.activeCombatantId === owner &&
      context.previous.round >= effect.expiresAtRound
    );
  });
}

export type ReminderEffect = EffectState & {
  metadata?: EffectMetadata | null;
};

export type EffectReminder = {
  effectId: string;
  targetId: string;
  kind: "expiry" | "save" | "ongoing";
  // "due" needs a DM decision now; "upcoming" is a heads-up for the current turn.
  phase: "due" | "upcoming";
  text: string;
};

/**
 * Reminders derived purely from the current state. Nothing is stored, so a
 * refresh, a rapid double click, or Previous/Next can never duplicate one, and
 * an effect keeps asking until the DM removes or extends it. Nothing here rolls
 * a save or applies damage.
 */
export function effectReminders(
  effects: ReminderEffect[],
  context: {
    round: number;
    activeCombatantId: string | null;
    order: string[];
    names?: Map<string, string>;
  },
): EffectReminder[] {
  const { round, activeCombatantId, order } = context;
  if (round < 1 || !activeCombatantId) return [];
  const activeIdx = order.indexOf(activeCombatantId);
  const nameOf = (id: string | null) =>
    (id && context.names?.get(id)) || "its source";
  const out: EffectReminder[] = [];

  for (const e of effects) {
    if (!e.isActive) continue;
    const meta = e.metadata ?? null;

    if (e.expiresAtRound !== null && e.expiryTrigger !== "none") {
      const sourceBased = e.expiryTrigger.endsWith("source_turn");
      const owner = sourceBased ? e.sourceCombatantId : e.targetId;
      const startBased = e.expiryTrigger.startsWith("start_of");
      const when = `${startBased ? "start" : "end"} of ${nameOf(owner)}'s turn`;
      const ownerIdx = owner ? order.indexOf(owner) : -1;
      if (!owner || ownerIdx < 0) {
        // The owner left the turn order, so its turn will never come around.
        out.push({
          effectId: e.id,
          targetId: e.targetId,
          kind: "expiry",
          phase: "due",
          text: `${e.name} was set to end at the ${when}, but that creature is no longer in the turn order. Resolve it manually.`,
        });
      } else {
        const reached = startBased
          ? round > e.expiresAtRound ||
            (round === e.expiresAtRound && activeIdx >= ownerIdx)
          : round > e.expiresAtRound ||
            (round === e.expiresAtRound && activeIdx > ownerIdx);
        if (reached) {
          out.push({
            effectId: e.id,
            targetId: e.targetId,
            kind: "expiry",
            phase: "due",
            text: `${e.name}: its duration reached the ${when}. Remove it, or extend it if it should continue.`,
          });
        } else if (
          !startBased &&
          round === e.expiresAtRound &&
          activeIdx === ownerIdx
        ) {
          out.push({
            effectId: e.id,
            targetId: e.targetId,
            kind: "expiry",
            phase: "upcoming",
            text: `${e.name} is set to end at the ${when} (this turn).`,
          });
        }
      }
    }

    if (e.targetId === activeCombatantId && meta?.save) {
      out.push({
        effectId: e.id,
        targetId: e.targetId,
        kind: "save",
        phase: "upcoming",
        text: `${e.name}: DC ${meta.save.dc} ${meta.save.ability} saving throw at the ${meta.save.timing} of this turn. The DM rolls and resolves it.`,
      });
    }
    if (e.targetId === activeCombatantId && meta?.remindAt) {
      const what = [meta.damageDice, meta.damageType].filter(Boolean).join(" ");
      out.push({
        effectId: e.id,
        targetId: e.targetId,
        kind: "ongoing",
        phase: "upcoming",
        text: `${e.name}: ongoing effect at the ${meta.remindAt} of this turn${what ? ` (${what})` : ""}. Apply it manually.`,
      });
    }
  }
  return out;
}

/** Inverse of a recorded change set; later changes are undone first. */
export type InverseChange =
  | Extract<Change, { kind: "update" }>
  | { kind: "delete"; entity: "combatant" | "effect"; id: string };

export function invertChanges(changes: Change[]): InverseChange[] {
  return [...changes].reverse().map((change): InverseChange => {
    if (change.kind === "create") {
      return { kind: "delete", entity: change.entity, id: change.id };
    }
    return { ...change, before: change.after, after: change.before } as Extract<
      Change,
      { kind: "update" }
    >;
  });
}

/** True when every field the change expected to find still has that value. */
export function matchesExpected(
  current: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const actual = current[key];
    if (actual instanceof Date) return actual.toISOString() === value;
    return JSON.stringify(actual ?? null) === JSON.stringify(value ?? null);
  });
}

/** Names for bulk entries: "Goblin 1", "Goblin 2"; a single bare name stays bare. */
export function numberedNames(label: string, quantity: number): string[] {
  if (quantity === 1) return [label];
  return Array.from({ length: quantity }, (_, i) => `${label} ${i + 1}`);
}
