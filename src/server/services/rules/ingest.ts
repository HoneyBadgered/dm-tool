import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  fetchAndValidateApiRoot,
  fetchAndValidateCollection,
  fetchAndValidateDetail,
  RULE_API_BASE_URL,
  RULE_COLLECTIONS,
  type FetchImplementation,
  type RuleCollection,
  type RuleCollectionItem,
  type RuleDetail,
} from "./api";

export type RuleImportMode = "preview" | "import" | "sync";

export type RuleImportError = {
  collection: RuleCollection | null;
  index: string | null;
  stage: "collection" | "summary" | "detail" | "database" | "sync";
  message: string;
};

export type RuleImportCounts = {
  discovered: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  deactivated: number;
};

export type RuleCollectionReport = RuleImportCounts & {
  collection: RuleCollection;
  complete: boolean;
  errorCount: number;
};

export type RuleImportReport = {
  id: string;
  mode: RuleImportMode;
  status: "completed" | "partial" | "failed";
  writesEnabled: boolean;
  collections: RuleCollectionReport[];
  counts: RuleImportCounts;
  errorCount: number;
  errors: RuleImportError[];
  summary: string;
};

export type RulesImportDb = Pick<
  PrismaClient,
  "ruleSource" | "ruleEntry" | "ruleImportRun"
>;

type Options = {
  mode: RuleImportMode;
  collections?: readonly RuleCollection[];
  fetchImpl?: FetchImplementation;
  db?: RulesImportDb;
  now?: () => Date;
};

type CollectionState = RuleCollectionReport & {
  existing: Map<
    string,
    {
      id: string;
      sourceKey: string | null;
      contentHash: string | null;
      isActive: boolean;
    }
  >;
  seenKeys: Set<string>;
};

type DetailTask = {
  state: CollectionState;
  item: RuleCollectionItem;
  detail: RuleDetail;
  contentHash: string;
};

const MAX_STORED_ERRORS = 100;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const DETAIL_CONCURRENCY = 8;
const DB_CONCURRENCY = 6;
const COLLECTION_CONCURRENCY = 4;

const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.";

function createCollectionState(collection: RuleCollection): CollectionState {
  return {
    collection,
    complete: true,
    errorCount: 0,
    discovered: 0,
    valid: 0,
    invalid: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    deactivated: 0,
    existing: new Map(),
    seenKeys: new Set(),
  };
}

function createCounts(): RuleImportCounts {
  return {
    discovered: 0,
    valid: 0,
    invalid: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    deactivated: 0,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error("Source detail contained a non-JSON value.");
    }
    return serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${fields.join(",")}}`;
}

export function hashRuleContent(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown importer error.";
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function setCollectionError(
  state: CollectionState,
  errors: RuleImportError[],
  error: RuleImportError,
): void {
  state.complete = false;
  state.errorCount += 1;
  if (errors.length < MAX_STORED_ERRORS) errors.push(error);
}

function newError(
  collection: RuleCollection | null,
  index: string | null,
  stage: RuleImportError["stage"],
  error: unknown,
): RuleImportError {
  return {
    collection,
    index,
    stage,
    message: safeErrorMessage(error),
  };
}

function isKnownCollection(value: string): value is RuleCollection {
  return (RULE_COLLECTIONS as readonly string[]).includes(value);
}

function sumCounts(states: readonly CollectionState[]): RuleImportCounts {
  const counts = createCounts();
  for (const state of states) {
    for (const key of Object.keys(counts) as (keyof RuleImportCounts)[]) {
      counts[key] += state[key];
    }
  }
  return counts;
}

function buildSummary(
  mode: RuleImportMode,
  states: readonly CollectionState[],
  counts: RuleImportCounts,
  errorCount: number,
): string {
  const incompleteCollections = states.filter(
    (state) => !state.complete,
  ).length;
  const actions =
    mode === "preview"
      ? `${counts.created} would be created, ${counts.updated} would be updated, ${counts.unchanged} unchanged`
      : `${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged`;
  const errors =
    errorCount === 0
      ? ""
      : `; ${errorCount} errors across ${incompleteCollections} incomplete collections`;
  return `${mode} processed ${counts.discovered} records across ${states.length} collections: ${actions}, ${counts.skipped} skipped, ${counts.deactivated} deactivated${errors}.`;
}

function makeReport(
  id: string,
  mode: RuleImportMode,
  states: CollectionState[],
  errors: RuleImportError[],
  errorCount: number,
  fatal = false,
): RuleImportReport {
  const counts = sumCounts(states);
  const status = fatal ? "failed" : errorCount > 0 ? "partial" : "completed";
  return {
    id,
    mode,
    status,
    writesEnabled: mode !== "preview",
    collections: states.map((state) => ({
      collection: state.collection,
      complete: state.complete,
      errorCount: state.errorCount,
      discovered: state.discovered,
      valid: state.valid,
      invalid: state.invalid,
      created: state.created,
      updated: state.updated,
      unchanged: state.unchanged,
      skipped: state.skipped,
      deactivated: state.deactivated,
    })),
    counts,
    errorCount,
    errors,
    summary: buildSummary(mode, states, counts, errorCount),
  };
}

function assertUniqueCollections(collections: readonly RuleCollection[]): void {
  if (collections.length === 0) {
    throw new Error("Select at least one API collection to import.");
  }
  if (new Set(collections).size !== collections.length) {
    throw new Error("A collection may be selected only once per import run.");
  }
  for (const collection of collections) {
    if (!isKnownCollection(collection)) {
      throw new Error(`Unsupported rules collection: ${collection}`);
    }
  }
}

export async function runRulesImport({
  mode,
  collections = RULE_COLLECTIONS,
  fetchImpl = fetch,
  db = getDb(),
  now = () => new Date(),
}: Options): Promise<RuleImportReport> {
  assertUniqueCollections(collections);
  const states = collections.map(createCollectionState);
  const errors: RuleImportError[] = [];
  let errorCount = 0;
  let sourceId: string | undefined;
  let runId: string | undefined;

  try {
    const source = await db.ruleSource.upsert({
      where: {
        provider_apiEdition: { provider: "dnd5eapi.co", apiEdition: "2024" },
      },
      create: {
        provider: "dnd5eapi.co",
        apiEdition: "2024",
        apiBaseUrl: RULE_API_BASE_URL,
        srdLabel: "System Reference Document 5.2 (API edition label)",
        verifiedSrdRevision: null,
        licenseName:
          "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: SRD_ATTRIBUTION,
      },
      update: {
        apiBaseUrl: RULE_API_BASE_URL,
        srdLabel: "System Reference Document 5.2 (API edition label)",
        licenseName:
          "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: SRD_ATTRIBUTION,
      },
      select: { id: true },
    });
    sourceId = source.id;

    const run = await db.ruleImportRun.create({
      data: {
        sourceId,
        collection: collections.length === 1 ? collections[0] : null,
        mode,
        status: "running",
        writesEnabled: mode !== "preview",
      },
      select: { id: true },
    });
    runId = run.id;

    await fetchAndValidateApiRoot(fetchImpl);

    await mapConcurrent(states, COLLECTION_CONCURRENCY, async (state) => {
      try {
        const items = await fetchAndValidateCollection(
          state.collection,
          fetchImpl,
        );
        state.discovered = items.length;
        const validItems: RuleCollectionItem[] = [];
        for (const item of items) {
          if (state.seenKeys.has(item.index)) {
            state.invalid += 1;
            setCollectionError(
              state,
              errors,
              newError(
                state.collection,
                item.index,
                "summary",
                new Error("Collection contains a duplicate source key."),
              ),
            );
            errorCount += 1;
            continue;
          }
          state.seenKeys.add(item.index);
          validItems.push(item);
        }
        return validItems.map((item) => ({ state, item }));
      } catch (error) {
        setCollectionError(
          state,
          errors,
          newError(state.collection, null, "collection", error),
        );
        errorCount += 1;
        return [];
      }
    })
      .then((groups) => {
        const detailItems = groups.flat();
        return mapConcurrent(
          detailItems,
          DETAIL_CONCURRENCY,
          async ({ state, item }) => {
            try {
              const detail = await fetchAndValidateDetail(
                state.collection,
                item,
                fetchImpl,
              );
              state.valid += 1;
              return {
                state,
                item,
                detail,
                contentHash: hashRuleContent(detail),
              } satisfies DetailTask;
            } catch (error) {
              state.invalid += 1;
              setCollectionError(
                state,
                errors,
                newError(state.collection, item.index, "detail", error),
              );
              errorCount += 1;
              return null;
            }
          },
        );
      })
      .then(async (tasks) => {
        const detailTasks = tasks.filter(
          (task): task is DetailTask => task !== null,
        );

        await mapConcurrent(states, COLLECTION_CONCURRENCY, async (state) => {
          try {
            const rows = await db.ruleEntry.findMany({
              where: {
                sourceId,
                category: state.collection,
                origin: "imported",
              },
              select: {
                id: true,
                sourceKey: true,
                contentHash: true,
                isActive: true,
              },
            });
            state.existing = new Map(
              rows.flatMap((row) =>
                row.sourceKey
                  ? [
                      [
                        row.sourceKey,
                        {
                          id: row.id,
                          sourceKey: row.sourceKey,
                          contentHash: row.contentHash,
                          isActive: row.isActive,
                        },
                      ] as const,
                    ]
                  : [],
              ),
            );
          } catch (error) {
            throw new Error(
              `Could not load existing ${state.collection} records: ${safeErrorMessage(error)}`,
              { cause: error },
            );
          }
        });

        await mapConcurrent(detailTasks, DB_CONCURRENCY, async (task) => {
          const { state, item, detail, contentHash } = task;
          const existing = state.existing.get(item.index);
          if (!existing) {
            if (mode === "preview") {
              state.created += 1;
              return;
            }
            try {
              await db.ruleEntry.create({
                data: {
                  origin: "imported",
                  category: state.collection,
                  sourceKey: item.index,
                  sourceId,
                  name: detail.name,
                  rawData: toPrismaJson(detail),
                  contentHash,
                  isActive: true,
                  lastSeenAt: now(),
                },
                select: { id: true },
              });
              state.created += 1;
              return;
            } catch (error) {
              state.skipped += 1;
              setCollectionError(
                state,
                errors,
                newError(state.collection, item.index, "database", error),
              );
              errorCount += 1;
              return;
            }
          }

          if (mode === "preview") {
            if (existing.contentHash === contentHash && existing.isActive) {
              state.unchanged += 1;
            } else {
              state.updated += 1;
            }
            return;
          }

          const unchanged =
            existing.contentHash === contentHash && existing.isActive;
          try {
            const result = await db.ruleEntry.updateMany({
              where: {
                id: existing.id,
                sourceId,
                origin: "imported",
              },
              data: unchanged
                ? { lastSeenAt: now() }
                : {
                    name: detail.name,
                    rawData: toPrismaJson(detail),
                    contentHash,
                    isActive: true,
                    lastSeenAt: now(),
                  },
            });
            if (result.count !== 1) {
              state.skipped += 1;
              setCollectionError(
                state,
                errors,
                newError(
                  state.collection,
                  item.index,
                  "database",
                  new Error(
                    "Imported record changed ownership or disappeared during import; it was not updated.",
                  ),
                ),
              );
              errorCount += 1;
              return;
            }
            if (unchanged) {
              state.unchanged += 1;
            } else {
              state.updated += 1;
            }
          } catch (error) {
            state.skipped += 1;
            setCollectionError(
              state,
              errors,
              newError(state.collection, item.index, "database", error),
            );
            errorCount += 1;
          }
        });

        if (mode === "sync") {
          await mapConcurrent(states, COLLECTION_CONCURRENCY, async (state) => {
            if (!state.complete) return;
            const missing = [...state.existing.values()]
              .filter(
                (entry) =>
                  entry.isActive && !state.seenKeys.has(entry.sourceKey ?? ""),
              )
              .map((entry) => entry.id);
            if (missing.length === 0) return;

            try {
              const result = await db.ruleEntry.updateMany({
                where: {
                  id: { in: missing },
                  sourceId,
                  category: state.collection,
                  origin: "imported",
                  isActive: true,
                },
                data: { isActive: false },
              });
              state.deactivated += result.count;
            } catch (error) {
              setCollectionError(
                state,
                errors,
                newError(state.collection, null, "sync", error),
              );
              errorCount += 1;
            }
          });
        }
      });

    const report = makeReport(runId, mode, states, errors, errorCount);
    const completedAt = now();
    await db.ruleImportRun.update({
      where: { id: runId },
      data: {
        status: report.status,
        completedAt,
        discovered: report.counts.discovered,
        valid: report.counts.valid,
        invalid: report.counts.invalid,
        created: report.counts.created,
        updated: report.counts.updated,
        unchanged: report.counts.unchanged,
        skipped: report.counts.skipped,
        deactivated: report.counts.deactivated,
        errors: errors.length > 0 ? toPrismaJson(errors) : undefined,
        summary: report.summary,
      },
    });
    if (mode !== "preview" && report.status === "completed") {
      await db.ruleSource.update({
        where: { id: sourceId },
        data: { lastFetchedAt: completedAt },
      });
    }
    return report;
  } catch (error) {
    if (runId) {
      const fatalError = newError(null, null, "collection", error);
      if (errors.length < MAX_STORED_ERRORS) errors.push(fatalError);
      errorCount += 1;
      const report = makeReport(runId, mode, states, errors, errorCount, true);
      await db.ruleImportRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          completedAt: now(),
          discovered: report.counts.discovered,
          valid: report.counts.valid,
          invalid: report.counts.invalid,
          created: report.counts.created,
          updated: report.counts.updated,
          unchanged: report.counts.unchanged,
          skipped: report.counts.skipped,
          deactivated: report.counts.deactivated,
          errors: toPrismaJson(errors),
          summary: report.summary,
        },
      });
    }
    throw error;
  }
}
