export const MAX_TERMS = 20;
export const MAX_DICE_PER_TERM = 100;
export const MAX_SIDES_PER_DIE = 1000;
export const MAX_CONSTANT = 10_000;
const MAX_LENGTH = 100;

export type Term =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      keep: { mode: "highest" | "lowest"; n: number } | null;
    }
  | { kind: "constant"; sign: 1 | -1; value: number };

export type ParseResult =
  { ok: true; terms: Term[] } | { ok: false; error: string };

/**
 * Grammar (whitespace ignored, hand-parsed; nothing is ever evaluated as code):
 *   expression := term (("+" | "-") term)*
 *   term       := INT | [INT] "d" INT [("kh" | "kl") [INT]]
 */
export function parseExpression(source: string): ParseResult {
  const text = source.toLowerCase().replace(/\s+/g, "");
  if (text.length === 0) return { ok: false, error: "Enter a dice expression" };
  if (text.length > MAX_LENGTH)
    return { ok: false, error: "Expression is too long" };
  if (!/^[0-9dkhl+-]+$/.test(text))
    return {
      ok: false,
      error: "Only numbers, d, kh, kl, + and - are allowed",
    };

  const terms: Term[] = [];
  let i = 0;
  let sign: 1 | -1 = 1;
  if (text[0] === "+" || text[0] === "-") {
    sign = text[0] === "-" ? -1 : 1;
    i = 1;
  }

  const readInt = (): number | null => {
    const start = i;
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i++;
    return i === start ? null : Number(text.slice(start, i));
  };

  for (;;) {
    if (terms.length >= MAX_TERMS)
      return { ok: false, error: `Use at most ${MAX_TERMS} terms` };
    const leading = readInt();
    if (text[i] === "d") {
      i++;
      const count = leading ?? 1;
      const sides = readInt();
      if (sides === null)
        return { ok: false, error: "A die needs a number of sides, like d20" };
      if (count < 1 || count > MAX_DICE_PER_TERM)
        return {
          ok: false,
          error: `Roll between 1 and ${MAX_DICE_PER_TERM} dice per term`,
        };
      if (sides < 2 || sides > MAX_SIDES_PER_DIE)
        return {
          ok: false,
          error: `Dice need 2 to ${MAX_SIDES_PER_DIE} sides`,
        };
      let keep: Extract<Term, { kind: "dice" }>["keep"] = null;
      if (text.startsWith("kh", i) || text.startsWith("kl", i)) {
        const mode = text[i + 1] === "h" ? "highest" : "lowest";
        i += 2;
        const n = readInt() ?? 1;
        if (n < 1 || n > count)
          return {
            ok: false,
            error: "Keep between 1 and the number of dice rolled",
          };
        keep = { mode, n };
      }
      terms.push({ kind: "dice", sign, count, sides, keep });
    } else if (leading !== null) {
      if (leading > MAX_CONSTANT)
        return { ok: false, error: `Numbers can be at most ${MAX_CONSTANT}` };
      terms.push({ kind: "constant", sign, value: leading });
    } else {
      return { ok: false, error: "Expected a number or dice term" };
    }

    if (i >= text.length) return { ok: true, terms };
    if (text[i] !== "+" && text[i] !== "-")
      return { ok: false, error: `Unexpected "${text[i]}"` };
    sign = text[i] === "-" ? -1 : 1;
    i++;
    if (i >= text.length)
      return { ok: false, error: "The expression ends with an operator" };
  }
}

export type TermResult =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      keep: Extract<Term, { kind: "dice" }>["keep"];
      rolls: number[];
      kept: number[];
      subtotal: number;
    }
  | { kind: "constant"; sign: 1 | -1; value: number; subtotal: number };

export type Evaluation = {
  terms: TermResult[];
  total: number;
  /** Every die as rolled, in term order; reusable as manual input. */
  rolls: number[][];
};

export class DiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceInputError";
  }
}

export function countDice(terms: Term[]): number[] {
  return terms.flatMap((t) => (t.kind === "dice" ? [t.count] : []));
}

/** The same parsed terms with every dice count doubled (critical-hit damage). */
export function doubleDice(terms: Term[]): Term[] {
  return terms.map((t) =>
    t.kind === "dice"
      ? {
          ...t,
          count: t.count * 2,
          keep: t.keep ? { ...t.keep, n: t.keep.n * 2 } : null,
        }
      : t,
  );
}

/**
 * Evaluates parsed terms. `rolls` supplies physical or pre-rolled dice (one
 * array per dice term, in order); otherwise `rng` generates them.
 */
export function evaluateTerms(
  terms: Term[],
  options: { rng?: () => number; rolls?: number[][] } = {},
): Evaluation {
  const rng = options.rng ?? Math.random;
  let diceIndex = 0;
  const results: TermResult[] = [];
  const allRolls: number[][] = [];
  for (const term of terms) {
    if (term.kind === "constant") {
      results.push({ ...term, subtotal: term.sign * term.value });
      continue;
    }
    let rolls: number[];
    const supplied = options.rolls?.[diceIndex];
    if (options.rolls) {
      if (!supplied || supplied.length !== term.count)
        throw new DiceInputError(
          `Term ${diceIndex + 1} (${term.count}d${term.sides}) needs exactly ${term.count} die results`,
        );
      for (const value of supplied)
        if (!Number.isInteger(value) || value < 1 || value > term.sides)
          throw new DiceInputError(
            `Die results for d${term.sides} must be whole numbers from 1 to ${term.sides}`,
          );
      rolls = supplied;
    } else {
      rolls = Array.from(
        { length: term.count },
        () => Math.floor(rng() * term.sides) + 1,
      );
    }
    diceIndex++;
    const kept = term.keep
      ? [...rolls]
          .sort((a, b) => (term.keep!.mode === "highest" ? b - a : a - b))
          .slice(0, term.keep.n)
      : rolls;
    results.push({
      ...term,
      rolls,
      kept,
      subtotal: term.sign * kept.reduce((sum, v) => sum + v, 0),
    });
    allRolls.push(rolls);
  }
  return {
    terms: results,
    total: results.reduce((sum, r) => sum + r.subtotal, 0),
    rolls: allRolls,
  };
}

export function rollExpression(
  source: string,
  options: { rng?: () => number; rolls?: number[][] } = {},
): Evaluation {
  const parsed = parseExpression(source);
  if (!parsed.ok) throw new DiceInputError(parsed.error);
  return evaluateTerms(parsed.terms, options);
}

/** Parses physical dice such as "4 6, 2" into a flat list of integers. */
export function parseDiceValues(source: string): number[] | null {
  const parts = source
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const values = parts.map((p) => (/^\d{1,4}$/.test(p) ? Number(p) : NaN));
  return values.some(Number.isNaN) ? null : values;
}

/** Splits a flat list of physical results across the dice terms of an expression. */
export function distributeValues(
  terms: Term[],
  values: number[],
  extra = 0,
): number[][] {
  const counts = countDice(terms).map((c) => c * (extra + 1));
  const need = counts.reduce((a, b) => a + b, 0);
  if (values.length !== need)
    throw new DiceInputError(
      `Expected ${need} die result${need === 1 ? "" : "s"}, got ${values.length}`,
    );
  let at = 0;
  return counts.map((c) => {
    const slice = values.slice(at, at + c);
    at += c;
    return slice;
  });
}

export function formatEvaluation(evaluation: Evaluation): string {
  return evaluation.terms
    .map((t, i) => {
      const sign = t.sign === -1 ? "−" : i === 0 ? "" : "+";
      if (t.kind === "constant") return `${sign}${t.value}`;
      const dice = t.keep
        ? `[${t.rolls.join(", ")}] keep ${t.keep.mode} ${t.keep.n} = ${t.kept.join("+")}`
        : `[${t.rolls.join(", ")}]`;
      return `${sign}${dice}`;
    })
    .join(" ");
}
