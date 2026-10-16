export type Combatant = {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  conditions: string[];
};

export type CombatState = {
  combatants: Combatant[];
  round: number;
  turnIndex: number;
};

export const emptyCombat: CombatState = {
  combatants: [],
  round: 1,
  turnIndex: 0,
};

export function sortByInitiative(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => b.initiative - a.initiative);
}

/** Add a combatant, keeping order and keeping the active turn on the same combatant. */
export function addCombatant(state: CombatState, c: Combatant): CombatState {
  const active = state.combatants[state.turnIndex]?.id;
  const combatants = sortByInitiative([...state.combatants, c]);
  const idx = active ? combatants.findIndex((x) => x.id === active) : 0;
  return { ...state, combatants, turnIndex: Math.max(idx, 0) };
}

export function removeCombatant(state: CombatState, id: string): CombatState {
  const pos = state.combatants.findIndex((c) => c.id === id);
  if (pos === -1) return state;
  const combatants = state.combatants.filter((c) => c.id !== id);
  let turnIndex = state.turnIndex;
  if (pos < turnIndex) turnIndex -= 1;
  if (turnIndex >= combatants.length) turnIndex = 0;
  return { ...state, combatants, turnIndex };
}

export function nextTurn(state: CombatState): CombatState {
  if (state.combatants.length === 0) return state;
  const next = state.turnIndex + 1;
  return next >= state.combatants.length
    ? { ...state, turnIndex: 0, round: state.round + 1 }
    : { ...state, turnIndex: next };
}

export function previousTurn(state: CombatState): CombatState {
  if (state.combatants.length === 0) return state;
  if (state.turnIndex > 0) return { ...state, turnIndex: state.turnIndex - 1 };
  if (state.round <= 1) return state;
  return {
    ...state,
    turnIndex: state.combatants.length - 1,
    round: state.round - 1,
  };
}

/** Parses "-7", "+5" or "7" (damage) into a signed delta; null if invalid. */
export function parseHpDelta(input: string): number | null {
  const m = /^\s*([+-]?)\s*(\d+)\s*$/.exec(input);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === "+" ? n : -n;
}

export function applyHpDelta(c: Combatant, delta: number): Combatant {
  const hp = Math.min(c.maxHp, Math.max(0, c.hp + delta));
  return { ...c, hp };
}

export function toggleCondition(c: Combatant, condition: string): Combatant {
  const name = condition.trim();
  if (!name) return c;
  const has = c.conditions.includes(name);
  return {
    ...c,
    conditions: has
      ? c.conditions.filter((x) => x !== name)
      : [...c.conditions, name],
  };
}

/** Parses "3 goblins" / "goblin" into a base name and count. */
export function parseBulkName(
  input: string,
): { name: string; count: number } | null {
  const m = /^\s*(?:(\d{1,2})\s*x?\s+)?(.+?)\s*$/i.exec(input);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  if (count < 1) return null;
  let name = m[2];
  if (count > 1 && /s$/i.test(name) && !/ss$/i.test(name))
    name = name.slice(0, -1);
  return { name, count };
}

/** Names for bulk-added combatants: "Goblin 1", "Goblin 2"... (single stays bare). */
export function numberedNames(
  name: string,
  count: number,
  startAt = 1,
): string[] {
  if (count === 1 && startAt === 1) return [name];
  return Array.from({ length: count }, (_, i) => `${name} ${startAt + i}`);
}
