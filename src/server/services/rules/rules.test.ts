import { describe, expect, it, vi } from "vitest";
import {
  getRuleEntryDetail,
  getMonsterDetail,
  getRulesOverview,
  getRulesImportStatus,
  hasEquipmentView,
  listRuleCategory,
  listMonsters,
  listEquipmentView,
  searchRuleEntries,
  type RulesDb,
} from "./rules";

function fakeDb(
  rows: Record<string, unknown>[] = [],
  source: Record<string, unknown> | null = null,
  groups: Record<string, unknown>[] = [],
) {
  const ruleEntry = {
    findMany: vi.fn().mockResolvedValue(rows),
    findFirst: vi.fn().mockResolvedValue(rows[0] ?? null),
    groupBy: vi.fn().mockResolvedValue(groups),
    count: vi.fn().mockResolvedValue(rows.length),
  };
  const ruleSource = {
    findFirst: vi.fn().mockResolvedValue(source),
  };
  return {
    ruleEntry,
    ruleSource,
    db: { ruleEntry, ruleSource } as unknown as RulesDb,
  };
}

const equipmentRecords = [
  {
    id: "battleaxe",
    name: "Battleaxe",
    source: {
      srdLabel: "SRD 5.2",
      apiEdition: "2024",
      verifiedSrdRevision: null,
    },
    rawData: {
      description: ["A martial melee weapon."],
      cost: { quantity: 10, unit: "gp" },
      weight: 4,
      equipment_categories: [
        { index: "martial-melee-weapons", name: "Martial Melee Weapons" },
        { index: "martial-weapons", name: "Martial Weapons" },
        { index: "melee-weapons", name: "Melee Weapons" },
        { index: "weapons", name: "Weapons" },
      ],
    },
  },
  {
    id: "chain-mail",
    name: "Chain Mail",
    source: {
      srdLabel: "SRD 5.2",
      apiEdition: "2024",
      verifiedSrdRevision: null,
    },
    rawData: {
      equipment_categories: [
        { index: "heavy-armor", name: "Heavy Armor" },
        { index: "armor", name: "Armor" },
      ],
    },
  },
  {
    id: "backpack",
    name: "Backpack",
    source: {
      srdLabel: "SRD 5.2",
      apiEdition: "2024",
      verifiedSrdRevision: null,
    },
    rawData: {
      equipment_categories: [
        { index: "adventuring-gear", name: "Adventuring Gear" },
      ],
    },
  },
];

describe("rules library", () => {
  it("keeps the API's unverified SRD revision explicit in the overview", async () => {
    const source = {
      apiEdition: "2024",
      srdLabel: "SRD 5.2",
      verifiedSrdRevision: null,
      licenseName: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Required SRD attribution.",
    };
    const { db, ruleSource, ruleEntry } = fakeDb([], source, [
      { category: "equipment", _count: { _all: 182 } },
    ]);

    await expect(getRulesOverview(db)).resolves.toEqual({
      source,
      importedCounts: { equipment: 182 },
    });
    expect(ruleSource.findFirst).toHaveBeenCalledWith({
      where: { provider: "dnd5eapi.co", apiEdition: "2024" },
      select: {
        apiEdition: true,
        srdLabel: true,
        verifiedSrdRevision: true,
        licenseName: true,
        licenseUrl: true,
        attribution: true,
      },
    });
    expect(ruleEntry.groupBy).toHaveBeenCalledWith({
      by: ["category"],
      where: {
        origin: "imported",
        isActive: true,
        source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
      },
      _count: { _all: true },
    });
  });

  it("renders equipment views as filters over one imported equipment collection", async () => {
    const { db, ruleEntry } = fakeDb(equipmentRecords);

    await expect(listEquipmentView("all", db)).resolves.toHaveLength(3);
    await expect(listEquipmentView("weapons", db)).resolves.toEqual([
      {
        id: "battleaxe",
        name: "Battleaxe",
        description: ["A martial melee weapon."],
        categoryLabels: [
          "Martial Melee Weapons",
          "Martial Weapons",
          "Melee Weapons",
          "Weapons",
        ],
        cost: "10 gp",
        weight: "4 lb.",
        source: {
          srdLabel: "SRD 5.2",
          apiEdition: "2024",
          verifiedSrdRevision: null,
        },
      },
    ]);
    await expect(listEquipmentView("armor", db)).resolves.toMatchObject([
      { id: "chain-mail", name: "Chain Mail" },
    ]);
    await expect(
      listEquipmentView("adventuring-gear", db),
    ).resolves.toMatchObject([{ id: "backpack", name: "Backpack" }]);
    expect(ruleEntry.findMany).toHaveBeenCalledWith({
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
  });

  it("surfaces imported equipment with missing source metadata as an error", async () => {
    const { db } = fakeDb([
      {
        id: "battleaxe",
        name: "Battleaxe",
        source: null,
        rawData: {
          equipment_categories: [{ index: "weapons", name: "Weapons" }],
        },
      },
    ]);

    await expect(listEquipmentView("weapons", db)).rejects.toThrow(
      "Imported equipment entry has no source: battleaxe",
    );
  });

  it("accepts only supported equipment views", () => {
    expect(hasEquipmentView("all")).toBe(true);
    expect(hasEquipmentView("weapons")).toBe(true);
    expect(hasEquipmentView("armor")).toBe(true);
    expect(hasEquipmentView("adventuring-gear")).toBe(true);
    expect(hasEquipmentView("rules")).toBe(false);
  });

  it("searches active imported records by name or stable source key", async () => {
    const rows = [
      {
        id: "monster-1",
        category: "monsters",
        name: "Ancient Dragon",
        rawData: { description: ["A mighty", "dragon."] },
        source: {
          srdLabel: "SRD 5.2",
          apiEdition: "2024",
          verifiedSrdRevision: null,
        },
      },
    ];
    const { db, ruleEntry } = fakeDb(rows);

    await expect(
      searchRuleEntries(" dragon ", "monsters", db),
    ).resolves.toEqual([
      {
        id: "monster-1",
        category: "monsters",
        name: "Ancient Dragon",
        excerpt: "A mighty dragon.",
        source: rows[0].source,
      },
    ]);
    expect(ruleEntry.findMany).toHaveBeenCalledWith({
      where: {
        origin: "imported",
        isActive: true,
        category: "monsters",
        source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
        OR: [
          { name: { contains: "dragon", mode: "insensitive" } },
          { sourceKey: { contains: "dragon", mode: "insensitive" } },
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
  });

  it("does not query for blank searches and rejects oversized search terms", async () => {
    const { db, ruleEntry } = fakeDb();

    await expect(searchRuleEntries("   ", undefined, db)).resolves.toEqual([]);
    await expect(
      searchRuleEntries("x".repeat(101), undefined, db),
    ).rejects.toThrow("100 characters or fewer");
    expect(ruleEntry.findMany).not.toHaveBeenCalled();
  });

  it("lists every category record in stable pages and supports an optional filter", async () => {
    const rows = [
      {
        id: "entry-1",
        category: "spells",
        name: "Acid Arrow",
        rawData: { desc: ["A streaking arrow of acid."] },
        source: equipmentRecords[0].source,
      },
    ];
    const { db, ruleEntry } = fakeDb(rows);
    ruleEntry.count.mockResolvedValue(101);

    await expect(listRuleCategory("spells", 2, "acid", db)).resolves.toEqual({
      category: "spells",
      page: 2,
      pageSize: 50,
      total: 101,
      pageCount: 3,
      items: [
        {
          id: "entry-1",
          category: "spells",
          name: "Acid Arrow",
          excerpt: "A streaking arrow of acid.",
          source: equipmentRecords[0].source,
        },
      ],
    });
    const queryWhere = {
      origin: "imported",
      category: "spells",
      isActive: true,
      source: { is: { provider: "dnd5eapi.co", apiEdition: "2024" } },
      OR: [
        { name: { contains: "acid", mode: "insensitive" } },
        { sourceKey: { contains: "acid", mode: "insensitive" } },
      ],
    };
    expect(ruleEntry.count).toHaveBeenCalledWith({ where: queryWhere });
    expect(ruleEntry.findMany).toHaveBeenCalledWith({
      where: queryWhere,
      orderBy: { name: "asc" },
      skip: 50,
      take: 50,
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
  });

  it("loads source-attributed details for active imported non-monster records only", async () => {
    const row = {
      id: "spell-1",
      category: "spells",
      sourceKey: "acid-arrow",
      name: "Acid Arrow",
      rawData: {
        index: "acid-arrow",
        name: "Acid Arrow",
        level: 2,
        desc: ["A streaking arrow of acid."],
      },
      source: equipmentRecords[0].source,
    };
    const { db, ruleEntry } = fakeDb([row]);

    await expect(getRuleEntryDetail("spell-1", db)).resolves.toEqual(row);
    expect(ruleEntry.findFirst).toHaveBeenCalledWith({
      where: {
        id: "spell-1",
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
  });

  it("rejects invalid category listing pages", async () => {
    const { db, ruleEntry } = fakeDb();
    await expect(listRuleCategory("spells", 0, "", db)).rejects.toThrow(
      "positive integer",
    );
    await expect(
      listRuleCategory("spells", 1, "x".repeat(101), db),
    ).rejects.toThrow("100 characters or fewer");
    expect(ruleEntry.findMany).not.toHaveBeenCalled();
    expect(ruleEntry.count).not.toHaveBeenCalled();
  });

  it("returns the latest bounded import history and parses only safe error fields", async () => {
    const lastFetchedAt = new Date("2026-10-20T12:00:00Z");
    const source = { lastFetchedAt };
    const runs = [
      {
        id: "run-1",
        collection: null,
        mode: "preview" as const,
        status: "partial" as const,
        writesEnabled: false,
        startedAt: new Date("2026-10-20T11:00:00Z"),
        completedAt: new Date("2026-10-20T11:01:00Z"),
        discovered: 12,
        valid: 11,
        invalid: 1,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        deactivated: 0,
        summary: "preview partial",
        errors: [
          {
            collection: "monsters",
            stage: "detail",
            message: "bad detail",
            index: "ignored",
          },
          { stage: 4, message: "ignored" },
        ],
      },
    ];
    const ruleSource = { findFirst: vi.fn().mockResolvedValue(source) };
    const ruleImportRun = { findMany: vi.fn().mockResolvedValue(runs) };
    const db = {
      ruleSource,
      ruleImportRun,
      ruleEntry: { findMany: vi.fn() },
    } as unknown as Parameters<typeof getRulesImportStatus>[0];

    await expect(getRulesImportStatus(db)).resolves.toEqual({
      lastFetchedAt,
      runs: [
        {
          ...runs[0],
          errors: [
            {
              collection: "monsters",
              stage: "detail",
              message: "bad detail",
            },
          ],
        },
      ],
    });
    expect(ruleImportRun.findMany).toHaveBeenCalledWith({
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
    });
  });

  it("filters monster list results and derives available stat-block facets", async () => {
    const monsterRows = [
      {
        id: "monster-1",
        sourceKey: "aboleth",
        name: "Aboleth",
        source: equipmentRecords[0].source,
        rawData: {
          size: "Large",
          type: "aberration",
          alignment: "lawful evil",
          challenge_rating: 10,
          armor_class: [{ value: 17 }],
          hit_points: 150,
        },
      },
      {
        id: "monster-2",
        sourceKey: "adult-black-dragon",
        name: "Adult Black Dragon",
        source: equipmentRecords[0].source,
        rawData: {
          size: "Huge",
          type: "dragon",
          alignment: "chaotic evil",
          challenge_rating: 14,
          armor_class: [{ value: 19 }],
          hit_points: 195,
        },
      },
      {
        id: "monster-3",
        sourceKey: "goblin",
        name: "Goblin",
        source: equipmentRecords[0].source,
        rawData: {
          size: "Small",
          type: "goblinoid",
          alignment: "neutral evil",
          challenge_rating: 0.125,
          armor_class: [{ value: 15 }],
          hit_points: 7,
        },
      },
    ];
    const { db, ruleEntry } = fakeDb(monsterRows);

    await expect(
      listMonsters({ query: "ABO", type: "aberration" }, db),
    ).resolves.toMatchObject({
      items: [
        {
          id: "monster-1",
          sourceKey: "aboleth",
          name: "Aboleth",
          size: "Large",
          type: "aberration",
          challengeRating: "10",
          armorClass: "17",
          hitPoints: 150,
        },
      ],
      sizes: ["Huge", "Large", "Small"],
      types: ["aberration", "dragon", "goblinoid"],
      challengeRatings: ["1/8", "10", "14"],
    });
    await expect(
      listMonsters({ challengeRating: "1/8" }, db),
    ).resolves.toMatchObject({
      items: [{ id: "monster-3", challengeRating: "1/8" }],
    });
    expect(ruleEntry.findMany).toHaveBeenCalledWith({
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
  });

  it("maps structured monster detail fields for stat-block presentation", async () => {
    const row = {
      id: "monster-1",
      sourceKey: "aboleth",
      name: "Aboleth",
      source: equipmentRecords[0].source,
      rawData: {
        size: "Large",
        type: "aberration",
        alignment: "lawful evil",
        armor_class: [{ value: 17, armor_type: { name: "Natural Armor" } }],
        hit_points: 150,
        hit_dice: "20d10 + 40",
        speed: { walk: "10 ft.", swim: "40 ft." },
        strength: 21,
        dexterity: 9,
        constitution: 15,
        intelligence: 18,
        wisdom: 15,
        charisma: 18,
        proficiencies: [
          { proficiency: { name: "Saving Throw: Constitution" }, value: 6 },
        ],
        damage_resistances: ["cold"],
        condition_immunities: [{ index: "charmed", name: "Charmed" }],
        senses: { darkvision: "120 ft.", passive_perception: 20 },
        languages: "Deep Speech; telepathy 120 ft.",
        challenge_rating: 10,
        xp: 5900,
        special_abilities: [
          { name: "Amphibious", desc: "The aboleth breathes air and water." },
        ],
        actions: [{ name: "Tentacle", desc: "The aboleth lashes out." }],
        legendary_actions: [
          { name: "Detect", desc: "The aboleth makes a Wisdom check." },
        ],
      },
    };
    const { db, ruleEntry } = fakeDb([row]);

    await expect(getMonsterDetail(row.id, db)).resolves.toMatchObject({
      id: "monster-1",
      sourceKey: "aboleth",
      size: "Large",
      armorClass: "17 (Natural Armor)",
      hitPoints: 150,
      hitDice: "20d10 + 40",
      speed: ["walk: 10 ft.", "swim: 40 ft."],
      abilityScores: [
        { label: "STR", value: 21 },
        { label: "DEX", value: 9 },
        { label: "CON", value: 15 },
        { label: "INT", value: 18 },
        { label: "WIS", value: 15 },
        { label: "CHA", value: 18 },
      ],
      savingThrowsAndSkills: ["Saving Throw: Constitution +6"],
      damageResistances: ["cold"],
      conditionImmunities: ["Charmed"],
      senses: ["darkvision: 120 ft.", "passive perception: 20"],
      languages: ["Deep Speech", "telepathy 120 ft."],
      experience: 5900,
      sections: [
        {
          title: "Traits",
          entries: [
            {
              name: "Amphibious",
              description: "The aboleth breathes air and water.",
            },
          ],
        },
        {
          title: "Actions",
          entries: [
            { name: "Tentacle", description: "The aboleth lashes out." },
          ],
        },
        {
          title: "Legendary Actions",
          entries: [
            {
              name: "Detect",
              description: "The aboleth makes a Wisdom check.",
            },
          ],
        },
      ],
    });
    expect(ruleEntry.findFirst).toHaveBeenCalledWith({
      where: {
        id: row.id,
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
  });
});
