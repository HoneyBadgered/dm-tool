import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";

export const EQUIPMENT_VIEWS = [
  "all",
  "weapons",
  "armor",
  "adventuring-gear",
] as const;

export type EquipmentView = (typeof EQUIPMENT_VIEWS)[number];

export const RULE_CATEGORY_INFO = [
  { value: "ability-scores", label: "Ability Scores" },
  { value: "alignments", label: "Alignments" },
  { value: "backgrounds", label: "Backgrounds" },
  { value: "classes", label: "Classes" },
  { value: "conditions", label: "Conditions" },
  { value: "damage-types", label: "Damage Types" },
  { value: "equipment", label: "Equipment" },
  { value: "equipment-categories", label: "Equipment Categories" },
  { value: "feats", label: "Feats" },
  { value: "features", label: "Features" },
  { value: "languages", label: "Languages" },
  { value: "magic-items", label: "Magic Items" },
  { value: "magic-schools", label: "Magic Schools" },
  { value: "monsters", label: "Monsters" },
  { value: "poisons", label: "Poisons" },
  { value: "proficiencies", label: "Proficiencies" },
  { value: "skills", label: "Skills" },
  { value: "species", label: "Species" },
  { value: "spells", label: "Spells" },
  { value: "subclasses", label: "Subclasses" },
  { value: "subspecies", label: "Subspecies" },
  { value: "traits", label: "Traits" },
  { value: "weapon-mastery-properties", label: "Weapon Mastery Properties" },
  { value: "weapon-properties", label: "Weapon Properties" },
] as const;

export type RuleCategory = (typeof RULE_CATEGORY_INFO)[number]["value"];

const equipmentViewLabels: Record<EquipmentView, string> = {
  all: "All Equipment",
  weapons: "Weapons",
  armor: "Armor",
  "adventuring-gear": "Adventuring Gear",
};

export type RulesDb = Pick<PrismaClient, "ruleSource" | "ruleEntry">;
export type RulesAdminDb = Pick<
  PrismaClient,
  "ruleSource" | "ruleImportRun" | "ruleEntry"
>;

export type RulesOverview = {
  source: {
    apiEdition: string;
    srdLabel: string;
    verifiedSrdRevision: string | null;
    licenseName: string;
    licenseUrl: string;
    attribution: string;
  } | null;
  importedCounts: Record<string, number>;
};

export type EquipmentEntry = {
  id: string;
  name: string;
  description: string[];
  categoryLabels: string[];
  cost: string | null;
  weight: string | null;
  source: {
    srdLabel: string;
    apiEdition: string;
    verifiedSrdRevision: string | null;
  };
};

export type RuleSearchResult = {
  id: string;
  category: RuleCategory;
  name: string;
  excerpt: string | null;
  source: {
    srdLabel: string;
    apiEdition: string;
    verifiedSrdRevision: string | null;
  };
};

export type RuleCategoryPage = {
  category: RuleCategory;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  items: RuleSearchResult[];
};

export type RuleEntryDetail = {
  id: string;
  category: RuleCategory;
  sourceKey: string;
  name: string;
  rawData: Prisma.JsonValue;
  source: EquipmentEntry["source"];
};

export type RuleImportRunSummary = {
  id: string;
  collection: string | null;
  mode: "preview" | "import" | "sync";
  status: "running" | "completed" | "partial" | "failed";
  writesEnabled: boolean;
  startedAt: Date;
  completedAt: Date | null;
  discovered: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  deactivated: number;
  summary: string | null;
  errors: { collection: string | null; stage: string; message: string }[];
};

export type RulesImportStatus = {
  lastFetchedAt: Date | null;
  runs: RuleImportRunSummary[];
};

export type MonsterFilters = {
  query?: string;
  size?: string;
  type?: string;
  challengeRating?: string;
};

export type MonsterListItem = {
  id: string;
  sourceKey: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  challengeRating: string;
  armorClass: string;
  hitPoints: number | null;
  source: EquipmentEntry["source"];
};

export type MonsterList = {
  items: MonsterListItem[];
  sizes: string[];
  types: string[];
  challengeRatings: string[];
};

export type MonsterDetail = MonsterListItem & {
  hitDice: string | null;
  speed: string[];
  abilityScores: { label: string; value: number }[];
  savingThrowsAndSkills: string[];
  damageVulnerabilities: string[];
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  senses: string[];
  languages: string[];
  experience: number | null;
  sections: {
    title: string;
    entries: { name: string; description: string }[];
  }[];
};

const ABILITY_SCORES = [
  { key: "strength", label: "STR" },
  { key: "dexterity", label: "DEX" },
  { key: "constitution", label: "CON" },
  { key: "intelligence", label: "INT" },
  { key: "wisdom", label: "WIS" },
  { key: "charisma", label: "CHA" },
] as const;

const CHALLENGE_RATING_FRACTIONS: Record<number, string> = {
  0.125: "1/8",
  0.25: "1/4",
  0.5: "1/2",
};

const CHALLENGE_RATING_VALUES: Record<string, number> = {
  "1/8": 0.125,
  "1/4": 0.25,
  "1/2": 0.5,
};

function isRecord(value: unknown): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const stringValue = readString(item);
    return stringValue ? [stringValue] : [];
  });
}

function readObjectNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    return name ? [name] : [];
  });
}

function readMonsterArmorClass(rawData: Prisma.JsonValue): string {
  if (!isRecord(rawData) || !Array.isArray(rawData.armor_class)) return "—";
  return (
    rawData.armor_class
      .flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.value !== "number") return [];
        const type = isRecord(entry.armor_type)
          ? readString(entry.armor_type.name)
          : null;
        return [type ? `${entry.value} (${type})` : String(entry.value)];
      })
      .join(", ") || "—"
  );
}

function readMonsterProficiencies(rawData: Prisma.JsonValue): string[] {
  if (!isRecord(rawData) || !Array.isArray(rawData.proficiencies)) return [];
  return rawData.proficiencies.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.proficiency)) return [];
    const name = readString(entry.proficiency.name);
    const value = readNumber(entry.value);
    if (!name || value === null) return [];
    return [`${name} ${value >= 0 ? "+" : ""}${value}`];
  });
}

function readMonsterSections(
  rawData: Prisma.JsonValue,
): MonsterDetail["sections"] {
  if (!isRecord(rawData)) return [];
  const sections = [
    ["Traits", rawData.special_abilities],
    ["Actions", rawData.actions],
    ["Bonus Actions", rawData.bonus_actions],
    ["Reactions", rawData.reactions],
    ["Legendary Actions", rawData.legendary_actions],
  ] as const;
  return sections.flatMap(([title, value]) => {
    if (!Array.isArray(value)) return [];
    const entries = value.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const name = readString(entry.name);
      const description = readString(entry.desc);
      if (!name || !description) return [];
      return [{ name, description }];
    });
    return entries.length > 0 ? [{ title, entries }] : [];
  });
}

function readMonsterListItem(row: {
  id: string;
  sourceKey: string | null;
  name: string;
  rawData: Prisma.JsonValue;
  source: EquipmentEntry["source"] | null;
}): MonsterListItem {
  const { id, sourceKey, name, rawData, source } = row;
  if (!sourceKey || !source) {
    throw new Error(`Imported monster is missing source identity: ${id}`);
  }
  if (!isRecord(rawData)) {
    throw new Error(`Imported monster has invalid source data: ${id}`);
  }
  return {
    id,
    sourceKey,
    name,
    size: readString(rawData.size) ?? "Unknown",
    type: readString(rawData.type) ?? "Unknown",
    alignment: readString(rawData.alignment) ?? "Unaligned",
    challengeRating: readMonsterChallengeRating(rawData.challenge_rating),
    armorClass: readMonsterArmorClass(rawData),
    hitPoints: readNumber(rawData.hit_points),
    source,
  };
}

function readMonsterChallengeRating(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return CHALLENGE_RATING_FRACTIONS[value] ?? String(value);
  }
  return readString(value) ?? "Unknown";
}

function numericChallengeRating(value: string): number {
  return CHALLENGE_RATING_VALUES[value] ?? Number(value);
}

function readEquipmentCategories(
  rawData: Prisma.JsonValue,
): { index: string; name: string }[] {
  if (!isRecord(rawData)) return [];
  const categories = rawData.equipment_categories;
  if (!Array.isArray(categories)) return [];

  return categories.flatMap((category) => {
    if (
      typeof category !== "object" ||
      category === null ||
      Array.isArray(category)
    ) {
      return [];
    }
    const { index, name } = category;
    if (typeof index !== "string" || typeof name !== "string") return [];
    return [{ index, name }];
  });
}

function belongsToEquipmentView(
  rawData: Prisma.JsonValue,
  view: EquipmentView,
): boolean {
  if (view === "all") return true;
  const requiredIndex = view === "adventuring-gear" ? "adventuring-gear" : view;
  return readEquipmentCategories(rawData).some(
    (category) => category.index === requiredIndex,
  );
}

function readDescription(rawData: Prisma.JsonValue): string[] {
  if (!isRecord(rawData)) return [];
  const description = rawData.description;
  if (typeof description === "string") return [description];
  if (!Array.isArray(description)) return [];
  return description.filter((part): part is string => typeof part === "string");
}

function readCost(rawData: Prisma.JsonValue): string | null {
  if (!isRecord(rawData) || !isRecord(rawData.cost)) return null;
  const { quantity, unit } = rawData.cost;
  if (
    (typeof quantity !== "number" && typeof quantity !== "string") ||
    typeof unit !== "string"
  ) {
    return null;
  }
  return `${quantity} ${unit}`;
}

function readWeight(rawData: Prisma.JsonValue): string | null {
  if (!isRecord(rawData)) return null;
  const weight = rawData.weight;
  if (typeof weight !== "number" && typeof weight !== "string") return null;
  return `${weight} lb.`;
}

function readExcerpt(rawData: Prisma.JsonValue): string | null {
  if (!isRecord(rawData)) return null;
  const description = rawData.description ?? rawData.desc;
  const parts =
    typeof description === "string"
      ? [description]
      : Array.isArray(description)
        ? description.filter((part): part is string => typeof part === "string")
        : [];
  const excerpt = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!excerpt) return null;
  return excerpt.length > 240 ? `${excerpt.slice(0, 237)}...` : excerpt;
}

function readImportErrors(
  value: Prisma.JsonValue | null,
): RuleImportRunSummary["errors"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const collection =
      typeof entry.collection === "string" ? entry.collection : null;
    if (typeof entry.stage !== "string" || typeof entry.message !== "string") {
      return [];
    }
    return [{ collection, stage: entry.stage, message: entry.message }];
  });
}

export function getEquipmentViewLabel(view: EquipmentView): string {
  return equipmentViewLabels[view];
}

export async function getRulesOverview(
  db: RulesDb = getDb(),
): Promise<RulesOverview> {
  const [source, groups] = await Promise.all([
    db.ruleSource.findFirst({
      where: { provider: "dnd5eapi.co", apiEdition: "2024" },
      select: {
        apiEdition: true,
        srdLabel: true,
        verifiedSrdRevision: true,
        licenseName: true,
        licenseUrl: true,
        attribution: true,
      },
    }),
    db.ruleEntry.groupBy({
      by: ["category"],
      where: {
        origin: "imported",
        isActive: true,
        source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
      },
      _count: { _all: true },
    }),
  ]);

  return {
    source,
    importedCounts: Object.fromEntries(
      groups.map(({ category, _count }) => [category, _count._all]),
    ),
  };
}

export function isRuleCategory(value: string): value is RuleCategory {
  return RULE_CATEGORY_INFO.some((category) => category.value === value);
}

export async function searchRuleEntries(
  query: string,
  category?: RuleCategory,
  db: RulesDb = getDb(),
): Promise<RuleSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  if (normalizedQuery.length > 100) {
    throw new RangeError("Search query must be 100 characters or fewer.");
  }

  const rows = await db.ruleEntry.findMany({
    where: {
      origin: "imported",
      isActive: true,
      ...(category ? { category } : {}),
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { sourceKey: { contains: normalizedQuery, mode: "insensitive" } },
      ],
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      category: true,
      name: true,
      rawData: true,
      source: {
        select: {
          srdLabel: true,
          apiEdition: true,
          verifiedSrdRevision: true,
        },
      },
    },
  });

  return rows.flatMap(
    ({ id, category: resultCategory, name, rawData, source }) => {
      if (!source || !isRuleCategory(resultCategory)) {
        throw new Error(
          `Imported rules entry has invalid source/category: ${id}`,
        );
      }
      return [
        {
          id,
          category: resultCategory,
          name,
          excerpt: readExcerpt(rawData),
          source,
        },
      ];
    },
  );
}

export async function listRuleCategory(
  category: RuleCategory,
  page = 1,
  query = "",
  db: RulesDb = getDb(),
): Promise<RuleCategoryPage> {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError("Page number must be a positive integer.");
  }
  const normalizedQuery = query.trim();
  if (normalizedQuery.length > 100) {
    throw new RangeError("Search query must be 100 characters or fewer.");
  }

  const where = {
    origin: "imported" as const,
    category,
    isActive: true,
    source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
    ...(normalizedQuery
      ? {
          OR: [
            {
              name: { contains: normalizedQuery, mode: "insensitive" as const },
            },
            {
              sourceKey: {
                contains: normalizedQuery,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
  const pageSize = 50;
  const total = await db.ruleEntry.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const effectivePage = pageCount === 0 ? 1 : Math.min(page, pageCount);
  const rows =
    pageCount === 0
      ? []
      : await db.ruleEntry.findMany({
          where,
          orderBy: { name: "asc" },
          skip: (effectivePage - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            category: true,
            name: true,
            rawData: true,
            source: {
              select: {
                srdLabel: true,
                apiEdition: true,
                verifiedSrdRevision: true,
              },
            },
          },
        });

  const items = rows.map(
    ({ id, category: rowCategory, name, rawData, source }) => {
      if (!source || !isRuleCategory(rowCategory)) {
        throw new Error(
          `Imported rules entry has invalid source/category: ${id}`,
        );
      }
      return {
        id,
        category: rowCategory,
        name,
        excerpt: readExcerpt(rawData),
        source,
      };
    },
  );

  return {
    category,
    page: effectivePage,
    pageSize,
    total,
    pageCount,
    items,
  };
}

export async function getRuleEntryDetail(
  id: string,
  db: RulesDb = getDb(),
): Promise<RuleEntryDetail | null> {
  const row = await db.ruleEntry.findFirst({
    where: {
      id,
      origin: "imported",
      isActive: true,
      category: { not: "monsters" },
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
    },
    select: {
      id: true,
      category: true,
      sourceKey: true,
      name: true,
      rawData: true,
      source: {
        select: {
          srdLabel: true,
          apiEdition: true,
          verifiedSrdRevision: true,
        },
      },
    },
  });
  if (!row) return null;
  if (!row.sourceKey || !row.source || !isRuleCategory(row.category)) {
    throw new Error(`Imported rules entry has invalid identity/source: ${id}`);
  }
  return {
    id: row.id,
    category: row.category,
    sourceKey: row.sourceKey,
    name: row.name,
    rawData: row.rawData,
    source: row.source,
  };
}

export async function getRulesImportStatus(
  db: RulesAdminDb = getDb(),
): Promise<RulesImportStatus> {
  const [source, runs] = await Promise.all([
    db.ruleSource.findFirst({
      where: { provider: "dnd5eapi.co", apiEdition: "2024" },
      select: { lastFetchedAt: true },
    }),
    db.ruleImportRun.findMany({
      where: {
        source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        collection: true,
        mode: true,
        status: true,
        writesEnabled: true,
        startedAt: true,
        completedAt: true,
        discovered: true,
        valid: true,
        invalid: true,
        created: true,
        updated: true,
        unchanged: true,
        skipped: true,
        deactivated: true,
        summary: true,
        errors: true,
      },
    }),
  ]);

  return {
    lastFetchedAt: source?.lastFetchedAt ?? null,
    runs: runs.map((run) => ({
      ...run,
      errors: readImportErrors(run.errors),
    })),
  };
}

export async function listMonsters(
  filters: MonsterFilters = {},
  db: RulesDb = getDb(),
): Promise<MonsterList> {
  const query = filters.query?.trim() ?? "";
  if (query.length > 100) {
    throw new RangeError("Monster search must be 100 characters or fewer.");
  }
  const rows = await db.ruleEntry.findMany({
    where: {
      origin: "imported",
      category: "monsters",
      isActive: true,
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      sourceKey: true,
      name: true,
      rawData: true,
      source: {
        select: {
          srdLabel: true,
          apiEdition: true,
          verifiedSrdRevision: true,
        },
      },
    },
  });
  const allItems = rows.map(readMonsterListItem);
  const lowerQuery = query.toLocaleLowerCase();

  return {
    items: allItems.filter((monster) => {
      return (
        (!query ||
          monster.name.toLocaleLowerCase().includes(lowerQuery) ||
          monster.sourceKey.toLocaleLowerCase().includes(lowerQuery)) &&
        (!filters.size || monster.size === filters.size) &&
        (!filters.type || monster.type === filters.type) &&
        (!filters.challengeRating ||
          monster.challengeRating === filters.challengeRating)
      );
    }),
    sizes: [...new Set(allItems.map((monster) => monster.size))].sort(),
    types: [...new Set(allItems.map((monster) => monster.type))].sort(),
    challengeRatings: [
      ...new Set(allItems.map((monster) => monster.challengeRating)),
    ].sort((left, right) => {
      const leftNumber = numericChallengeRating(left);
      const rightNumber = numericChallengeRating(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right);
    }),
  };
}

export async function getMonsterDetail(
  id: string,
  db: RulesDb = getDb(),
): Promise<MonsterDetail | null> {
  const row = await db.ruleEntry.findFirst({
    where: {
      id,
      origin: "imported",
      category: "monsters",
      isActive: true,
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
    },
    select: {
      id: true,
      sourceKey: true,
      name: true,
      rawData: true,
      source: {
        select: {
          srdLabel: true,
          apiEdition: true,
          verifiedSrdRevision: true,
        },
      },
    },
  });
  if (!row) return null;
  const monster = readMonsterListItem(row);
  const rawData = row.rawData;
  if (!isRecord(rawData)) {
    throw new Error(`Imported monster has invalid source data: ${row.id}`);
  }

  const speed = isRecord(rawData.speed)
    ? Object.entries(rawData.speed).flatMap(([movement, distance]) => {
        const value = readString(distance);
        return value ? [`${movement}: ${value}`] : [];
      })
    : [];
  const abilityScores = ABILITY_SCORES.flatMap(({ key, label }) => {
    const value = readNumber(rawData[key]);
    return value === null ? [] : [{ label, value }];
  });
  const senses = isRecord(rawData.senses)
    ? Object.entries(rawData.senses).flatMap(([sense, value]) => {
        const detail =
          readString(value) ??
          (typeof value === "number" && Number.isFinite(value)
            ? String(value)
            : null);
        return detail ? [`${sense.replaceAll("_", " ")}: ${detail}`] : [];
      })
    : [];
  const languages =
    typeof rawData.languages === "string"
      ? rawData.languages
          .split(";")
          .map((language) => language.trim())
          .filter(Boolean)
      : readStringList(rawData.languages);

  return {
    ...monster,
    hitDice: readString(rawData.hit_dice),
    speed,
    abilityScores,
    savingThrowsAndSkills: readMonsterProficiencies(rawData),
    damageVulnerabilities: readStringList(rawData.damage_vulnerabilities),
    damageResistances: readStringList(rawData.damage_resistances),
    damageImmunities: readStringList(rawData.damage_immunities),
    conditionImmunities: readObjectNames(rawData.condition_immunities),
    senses,
    languages,
    experience: readNumber(rawData.xp),
    sections: readMonsterSections(rawData),
  };
}

export async function listEquipmentView(
  view: EquipmentView,
  db: RulesDb = getDb(),
): Promise<EquipmentEntry[]> {
  const rows = await db.ruleEntry.findMany({
    where: {
      origin: "imported",
      category: "equipment",
      isActive: true,
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      rawData: true,
      source: {
        select: {
          srdLabel: true,
          apiEdition: true,
          verifiedSrdRevision: true,
        },
      },
    },
  });

  return rows.flatMap(({ id, name, rawData, source }) => {
    if (!belongsToEquipmentView(rawData, view)) return [];
    if (!source) {
      throw new Error(`Imported equipment entry has no source: ${id}`);
    }
    return [
      {
        id,
        name,
        description: readDescription(rawData),
        categoryLabels: readEquipmentCategories(rawData).map(
          ({ name: categoryName }) => categoryName,
        ),
        cost: readCost(rawData),
        weight: readWeight(rawData),
        source,
      },
    ];
  });
}

export function hasEquipmentView(value: string): value is EquipmentView {
  return (EQUIPMENT_VIEWS as readonly string[]).includes(value);
}
