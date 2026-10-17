import { DICE_EXPRESSION_PATTERN } from "@/lib/validation/combat";

export type Rng = () => number;

export type DiceSpec = { count: number; sides: number; modifier: number };
export type DiceRoll = DiceSpec & { rolls: number[]; total: number };

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** Parses "3d6", "2d8+4" or "1d4 - 1". Returns null when invalid or out of bounds. */
export function parseDice(expression: string): DiceSpec | null {
  const match = DICE_EXPRESSION_PATTERN.exec(expression);
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || count > MAX_DICE || sides < 2 || sides > MAX_SIDES) {
    return null;
  }
  const amount = match[4] ? Number(match[4]) : 0;
  return { count, sides, modifier: match[3] === "-" ? -amount : amount };
}

export function averageDice(spec: DiceSpec): number {
  return Math.floor((spec.count * (spec.sides + 1)) / 2 + spec.modifier);
}

/** The rng is injectable so rolls are deterministic in tests. */
export function rollDice(
  expression: string,
  rng: Rng = Math.random,
): DiceRoll | null {
  const spec = parseDice(expression);
  if (!spec) return null;
  const rolls = Array.from(
    { length: spec.count },
    () => Math.floor(rng() * spec.sides) + 1,
  );
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier;
  return { ...spec, rolls, total };
}
