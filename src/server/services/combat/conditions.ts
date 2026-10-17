import { getDb } from "@/lib/db/client";

export type ConditionDefinition = {
  /** RuleEntry.id, used to link to the library page. */
  id: string;
  /** RuleEntry.sourceKey, stored on applied effects as conditionIndex. */
  index: string;
  name: string;
  description: string;
};

type Db = Pick<ReturnType<typeof getDb>, "ruleEntry">;

function descriptionOf(rawData: unknown): string {
  if (rawData && typeof rawData === "object" && "description" in rawData) {
    const value = (rawData as { description: unknown }).description;
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value.filter((v) => typeof v === "string").join("\n");
  }
  return "";
}

/**
 * Imported library conditions. These are rule definitions only; an applied
 * effect lives in CombatEffect and merely references one by sourceKey.
 */
export async function listConditionDefinitions(
  db: Db = getDb(),
): Promise<ConditionDefinition[]> {
  const rows = await db.ruleEntry.findMany({
    where: { category: "conditions", isActive: true, sourceKey: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, sourceKey: true, name: true, rawData: true },
  });
  return rows.map((row) => ({
    id: row.id,
    index: row.sourceKey!,
    name: row.name,
    description: descriptionOf(row.rawData),
  }));
}

/** Markdown-ish rule text reduced to plain text, shortened for tooltips and chips. */
export function conciseDescription(text: string, max = 220): string {
  const plain = text
    .replace(/\*\*|__|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
