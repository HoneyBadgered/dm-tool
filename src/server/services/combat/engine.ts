import type {
  Change,
  CombatStatusValue,
  CombatantStatusValue,
  EffectExpiryTriggerValue,
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
