import { z } from "zod";

export const RULE_API_BASE_URL = "https://www.dnd5eapi.co/api/2024";
export const RULE_API_ORIGIN = "https://www.dnd5eapi.co";

export const RULE_COLLECTIONS = [
  "ability-scores",
  "alignments",
  "backgrounds",
  "classes",
  "conditions",
  "damage-types",
  "equipment",
  "equipment-categories",
  "feats",
  "features",
  "languages",
  "magic-items",
  "magic-schools",
  "monsters",
  "poisons",
  "proficiencies",
  "skills",
  "species",
  "spells",
  "subclasses",
  "subspecies",
  "traits",
  "weapon-mastery-properties",
  "weapon-properties",
] as const;

export type RuleCollection = (typeof RULE_COLLECTIONS)[number];
export type FetchImplementation = typeof fetch;

const rootSchema = z.record(z.string(), z.string());
const nonBlankString = z.string().refine((value) => value.trim().length > 0);

const collectionItemSchema = z
  .object({
    index: nonBlankString,
    name: nonBlankString,
    url: z.string().min(1),
  })
  .passthrough();

const collectionResponseSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: z.array(collectionItemSchema),
    next: z.string().nullable().optional(),
    previous: z.string().nullable().optional(),
  })
  .passthrough();

const detailSchema = z
  .object({
    index: nonBlankString,
    name: nonBlankString,
  })
  .passthrough();

export type RuleCollectionItem = z.infer<typeof collectionItemSchema>;
export type RuleDetail = z.infer<typeof detailSchema>;

export class RulesApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RulesApiError";
  }
}

export function isRuleCollection(value: string): value is RuleCollection {
  return (RULE_COLLECTIONS as readonly string[]).includes(value);
}

function parseSchema<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  context: string,
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new RulesApiError(
      `${context} response did not match the expected schema: ${result.error.issues
        .slice(0, 3)
        .map(
          (issue) => `${issue.path.join(".") || "response"} ${issue.message}`,
        )
        .join("; ")}`,
    );
  }
  return result.data;
}

function validateRoot(payload: unknown): void {
  const root = parseSchema(rootSchema, payload, "API root");
  const actual = Object.keys(root).sort();
  const expected = [...RULE_COLLECTIONS].sort();
  if (
    actual.length !== expected.length ||
    actual.some((collection, index) => collection !== expected[index])
  ) {
    throw new RulesApiError(
      `API collection inventory changed. Expected ${expected.join(", ")}; received ${actual.join(", ")}.`,
    );
  }

  for (const collection of RULE_COLLECTIONS) {
    if (root[collection] !== `/api/2024/${collection}`) {
      throw new RulesApiError(
        `API root returned an unexpected route for collection ${collection}.`,
      );
    }
  }
}

function safeApiUrl(path: string, expectedPath?: string): URL {
  let url: URL;
  try {
    url = new URL(path, `${RULE_API_BASE_URL}/`);
  } catch (error) {
    throw new RulesApiError("API returned an invalid resource URL.", {
      cause: error,
    });
  }
  if (
    url.origin !== RULE_API_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (expectedPath !== undefined && url.pathname !== expectedPath)
  ) {
    throw new RulesApiError(
      "API returned a resource URL outside its expected route.",
    );
  }
  return url;
}

function matchesCollectionItemPath(
  url: URL,
  collection: RuleCollection,
  index: string,
): boolean {
  const canonicalPath = `/api/2024/${collection}/${encodeURIComponent(index)}`;
  if (url.pathname === canonicalPath) return true;

  return (
    collection === "proficiencies" &&
    url.pathname === `/api/2024/proficiencies/tool-${encodeURIComponent(index)}`
  );
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(
  path: string,
  context: string,
  fetchImpl: FetchImplementation,
): Promise<unknown> {
  const url = safeApiUrl(path);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error;
    }

    if (response && !response.ok) {
      const error = new RulesApiError(
        `${context} request failed with HTTP ${response.status}.`,
      );
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
    } else if (response) {
      try {
        return await response.json();
      } catch (error) {
        lastError = new RulesApiError(
          `${context} response was not valid JSON.`,
          {
            cause: error,
          },
        );
      }
    }

    if (attempt < 2) await delay(200 * 2 ** attempt);
  }

  const detail =
    lastError instanceof Error ? lastError.message : "unknown network error";
  throw new RulesApiError(
    `${context} request failed after 3 attempts: ${detail}`,
    {
      cause: lastError,
    },
  );
}

export async function fetchAndValidateApiRoot(
  fetchImpl: FetchImplementation = fetch,
): Promise<void> {
  const payload = await requestJson(
    `${RULE_API_BASE_URL}/`,
    "API root",
    fetchImpl,
  );
  validateRoot(payload);
}

export async function fetchAndValidateCollection(
  collection: RuleCollection,
  fetchImpl: FetchImplementation = fetch,
): Promise<RuleCollectionItem[]> {
  const payload = await requestJson(
    `${RULE_API_BASE_URL}/${collection}`,
    `${collection} collection`,
    fetchImpl,
  );
  const response = parseSchema(
    collectionResponseSchema,
    payload,
    `${collection} collection`,
  );

  if (response.count !== response.results.length) {
    throw new RulesApiError(
      `${collection} collection is incomplete: count is ${response.count}, but ${response.results.length} results were returned.`,
    );
  }
  if (response.next || response.previous) {
    throw new RulesApiError(
      `${collection} collection is paginated; import is blocked until pagination handling is reviewed.`,
    );
  }

  for (const item of response.results) {
    const url = safeApiUrl(item.url);
    if (!matchesCollectionItemPath(url, collection, item.index)) {
      throw new RulesApiError(
        `${collection}/${item.index} returned an unexpected detail route.`,
      );
    }
  }

  return response.results;
}

export async function fetchAndValidateDetail(
  collection: RuleCollection,
  item: RuleCollectionItem,
  fetchImpl: FetchImplementation = fetch,
): Promise<RuleDetail> {
  const listingUrl = safeApiUrl(item.url);
  if (!matchesCollectionItemPath(listingUrl, collection, item.index)) {
    throw new RulesApiError(
      `${collection}/${item.index} returned an unexpected detail route.`,
    );
  }
  const detailPath = `/api/2024/${collection}/${encodeURIComponent(item.index)}`;
  const payload = await requestJson(
    detailPath,
    `${collection}/${item.index} detail`,
    fetchImpl,
  );
  const detail = parseSchema(
    detailSchema,
    payload,
    `${collection}/${item.index} detail`,
  );
  if (detail.index !== item.index) {
    throw new RulesApiError(
      `${collection}/${item.index} detail returned a mismatched index.`,
    );
  }
  return detail;
}
