import { describe, expect, it, vi } from "vitest";
import { RULE_COLLECTIONS, type RuleCollection } from "./api";
import { hashRuleContent, runRulesImport, type RulesImportDb } from "./ingest";

type FakeEntry = {
  id: string;
  origin: "imported" | "homebrew";
  category: string;
  sourceKey: string | null;
  sourceId: string | null;
  name: string;
  rawData: unknown;
  contentHash: string | null;
  isActive: boolean;
  lastSeenAt: Date | null;
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeApiFetch(
  details: Record<string, Record<string, unknown>>,
  failingDetails: string[] = [],
): typeof fetch {
  const root = Object.fromEntries(
    RULE_COLLECTIONS.map((collection) => [
      collection,
      `/api/2024/${collection}`,
    ]),
  );
  return vi.fn<typeof fetch>(async (input) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/api/2024/") return jsonResponse(root);

    const [, api, edition, collectionName, index] = pathname.split("/");
    if (api !== "api" || edition !== "2024" || !collectionName) {
      return jsonResponse({ message: "not found" }, 404);
    }
    const collection = collectionName as RuleCollection;
    if (!index) {
      const results = Object.entries(details)
        .filter(([key]) => key.startsWith(`${collection}:`))
        .map(([key, detail]) => {
          const itemIndex = key.slice(collection.length + 1);
          return {
            index: itemIndex,
            name: String(detail.name),
            url: `/api/2024/${collection}/${itemIndex}`,
          };
        });
      return jsonResponse({ count: results.length, results });
    }
    if (failingDetails.includes(`${collection}:${index}`)) {
      return jsonResponse({ message: "not found" }, 404);
    }
    const detail = details[`${collection}:${index}`];
    return detail
      ? jsonResponse(detail)
      : jsonResponse({ message: "not found" }, 404);
  }) as typeof fetch;
}

function fakeDb(initialEntries: FakeEntry[] = []) {
  const entries = structuredClone(initialEntries);
  const runs: Record<string, unknown>[] = [];
  let nextId = 1;

  const ruleSource = {
    upsert: vi.fn(async () => ({ id: "source-1" })),
    update: vi.fn(async () => ({ id: "source-1" })),
  };

  const ruleEntry = {
    findMany: vi.fn(
      async (args: {
        where: { sourceId: string; category: string; origin: "imported" };
      }) =>
        entries
          .filter(
            (entry) =>
              entry.sourceId === args.where.sourceId &&
              entry.category === args.where.category &&
              entry.origin === args.where.origin,
          )
          .map(({ id, sourceKey, contentHash, isActive }) => ({
            id,
            sourceKey,
            contentHash,
            isActive,
          })),
    ),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const row = {
        id: `entry-${nextId++}`,
        ...(args.data as Omit<FakeEntry, "id">),
      } as FakeEntry;
      entries.push(row);
      return { id: row.id };
    }),
    updateMany: vi.fn(
      async (args: {
        where: {
          id?: string | { in: string[] };
          sourceId?: string;
          category?: string;
          origin?: "imported";
          isActive?: boolean;
        };
        data: Record<string, unknown>;
      }) => {
        const matches = entries.filter((entry) => {
          const idMatches =
            args.where.id === undefined ||
            (typeof args.where.id === "string"
              ? entry.id === args.where.id
              : args.where.id.in.includes(entry.id));
          return (
            idMatches &&
            (args.where.sourceId === undefined ||
              entry.sourceId === args.where.sourceId) &&
            (args.where.category === undefined ||
              entry.category === args.where.category) &&
            (args.where.origin === undefined ||
              entry.origin === args.where.origin) &&
            (args.where.isActive === undefined ||
              entry.isActive === args.where.isActive)
          );
        });
        for (const entry of matches) Object.assign(entry, args.data);
        return { count: matches.length };
      },
    ),
  };

  const ruleImportRun = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const run = { id: `run-${runs.length + 1}`, ...args.data };
      runs.push(run);
      return { id: run.id };
    }),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const run = runs.find((item) => item.id === args.where.id);
        if (!run) throw new Error("Run not found");
        Object.assign(run, args.data);
        return run;
      },
    ),
  };

  return {
    entries,
    runs,
    ruleEntry,
    ruleSource,
    ruleImportRun,
    db: {
      ruleSource,
      ruleEntry,
      ruleImportRun,
    } as unknown as RulesImportDb,
  };
}

const battleaxe = {
  index: "battleaxe",
  name: "Battleaxe",
  description: ["A martial melee weapon."],
  equipment_categories: [{ index: "weapons", name: "Weapons" }],
};

function battleaxeApi(
  description = "A martial melee weapon.",
  failingDetails: string[] = [],
) {
  return makeApiFetch(
    {
      "equipment:battleaxe": {
        ...battleaxe,
        description: [description],
      },
    },
    failingDetails,
  );
}

describe("rules importer", () => {
  it("hashes JSON deterministically regardless of object key order", () => {
    expect(hashRuleContent({ b: 2, a: { y: 1, x: 0 } })).toBe(
      hashRuleContent({ a: { x: 0, y: 1 }, b: 2 }),
    );
  });

  it("previews proposed changes without creating or updating entries", async () => {
    const { db, ruleEntry, ruleSource, runs } = fakeDb();
    const report = await runRulesImport({
      mode: "preview",
      collections: ["equipment"],
      fetchImpl: battleaxeApi(),
      db,
    });

    expect(report).toMatchObject({
      mode: "preview",
      status: "completed",
      writesEnabled: false,
      counts: { discovered: 1, valid: 1, created: 1 },
    });
    expect(ruleEntry.create).not.toHaveBeenCalled();
    expect(ruleEntry.updateMany).not.toHaveBeenCalled();
    expect(ruleSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          apiEdition: "2024",
          verifiedSrdRevision: null,
          srdLabel: "System Reference Document 5.2 (API edition label)",
        }),
      }),
    );
    expect(ruleSource.update).not.toHaveBeenCalled();
    expect(runs[0]).toMatchObject({
      collection: "equipment",
      status: "completed",
      writesEnabled: false,
    });
  });

  it("imports once and reports an identical repeat as unchanged", async () => {
    const { db, entries, ruleEntry } = fakeDb();
    const fetchImpl = battleaxeApi();

    const first = await runRulesImport({
      mode: "import",
      collections: ["equipment"],
      fetchImpl,
      db,
    });
    const firstId = entries[0].id;

    const second = await runRulesImport({
      mode: "import",
      collections: ["equipment"],
      fetchImpl,
      db,
    });

    expect(first.counts.created).toBe(1);
    expect(second.counts).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(firstId);
    expect(ruleEntry.create).toHaveBeenCalledTimes(1);
  });

  it("updates changed imported data by source identity", async () => {
    const { db, entries } = fakeDb();
    await runRulesImport({
      mode: "import",
      collections: ["equipment"],
      fetchImpl: battleaxeApi(),
      db,
    });

    const report = await runRulesImport({
      mode: "import",
      collections: ["equipment"],
      fetchImpl: battleaxeApi("A versatile martial weapon."),
      db,
    });

    expect(report.counts.updated).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Battleaxe");
    expect(entries[0].rawData).toMatchObject({
      description: ["A versatile martial weapon."],
    });
  });

  it("does not overwrite homebrew and sync deactivates only missing imported entries", async () => {
    const { db, entries } = fakeDb([
      {
        id: "homebrew-battleaxe",
        origin: "homebrew",
        category: "equipment",
        sourceKey: null,
        sourceId: null,
        name: "Battleaxe",
        rawData: { description: ["My homebrew version."] },
        contentHash: null,
        isActive: true,
        lastSeenAt: null,
      },
      {
        id: "imported-removed",
        origin: "imported",
        category: "equipment",
        sourceKey: "removed-item",
        sourceId: "source-1",
        name: "Removed Item",
        rawData: { index: "removed-item", name: "Removed Item" },
        contentHash: "previous-hash",
        isActive: true,
        lastSeenAt: null,
      },
    ]);

    const report = await runRulesImport({
      mode: "sync",
      collections: ["equipment"],
      fetchImpl: battleaxeApi(),
      db,
    });

    expect(report.counts.created).toBe(1);
    expect(report.counts.deactivated).toBe(1);
    expect(entries.find(({ id }) => id === "homebrew-battleaxe")).toMatchObject(
      {
        name: "Battleaxe",
        rawData: { description: ["My homebrew version."] },
        isActive: true,
      },
    );
    expect(entries.find(({ id }) => id === "imported-removed")?.isActive).toBe(
      false,
    );
  });

  it("never deactivates records when a detail request fails", async () => {
    const { db, entries } = fakeDb([
      {
        id: "imported-removed",
        origin: "imported",
        category: "equipment",
        sourceKey: "removed-item",
        sourceId: "source-1",
        name: "Removed Item",
        rawData: { index: "removed-item", name: "Removed Item" },
        contentHash: "previous-hash",
        isActive: true,
        lastSeenAt: null,
      },
    ]);

    const report = await runRulesImport({
      mode: "sync",
      collections: ["equipment"],
      fetchImpl: battleaxeApi("", ["equipment:battleaxe"]),
      db,
    });

    expect(report.status).toBe("partial");
    expect(report.counts.invalid).toBe(1);
    expect(report.counts.deactivated).toBe(0);
    expect(entries.find(({ id }) => id === "imported-removed")?.isActive).toBe(
      true,
    );
  });

  it("rejects unsupported or duplicate collections before creating runs", async () => {
    const { db, runs } = fakeDb();
    await expect(
      runRulesImport({
        mode: "preview",
        collections: ["rules" as RuleCollection],
        db,
      }),
    ).rejects.toThrow("Unsupported rules collection");
    await expect(
      runRulesImport({
        mode: "preview",
        collections: ["equipment", "equipment"],
        db,
      }),
    ).rejects.toThrow("selected only once");
    expect(runs).toHaveLength(0);
  });
});
