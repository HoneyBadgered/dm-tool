import { describe, expect, it, vi } from "vitest";
import {
  fetchAndValidateApiRoot,
  fetchAndValidateCollection,
  fetchAndValidateDetail,
  RULE_API_BASE_URL,
  RULE_COLLECTIONS,
  RulesApiError,
} from "./api";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rootResponse(): Record<string, string> {
  return Object.fromEntries(
    RULE_COLLECTIONS.map((collection) => [
      collection,
      `/api/2024/${collection}`,
    ]),
  );
}

describe("rules API client", () => {
  it("accepts exactly the verified root collection inventory", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(rootResponse()));

    await expect(fetchAndValidateApiRoot(fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`${RULE_API_BASE_URL}/`);
    expect(request).toMatchObject({
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
    });
  });

  it("rejects root route changes rather than silently importing an unknown API shape", async () => {
    const changedRoot = rootResponse();
    changedRoot.rules = "/api/2024/rules";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(changedRoot));

    await expect(fetchAndValidateApiRoot(fetchImpl)).rejects.toThrow(
      "API collection inventory changed",
    );
  });

  it("requires a complete collection response while leaving duplicate reporting to the import run", async () => {
    const mismatch = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        count: 2,
        results: [
          {
            index: "str",
            name: "STR",
            url: "/api/2024/ability-scores/str",
          },
        ],
      }),
    );
    await expect(
      fetchAndValidateCollection("ability-scores", mismatch),
    ).rejects.toThrow("count is 2, but 1 results were returned");

    const duplicate = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        count: 2,
        results: [
          {
            index: "str",
            name: "STR",
            url: "/api/2024/ability-scores/str",
          },
          {
            index: "str",
            name: "Strength",
            url: "/api/2024/ability-scores/str",
          },
        ],
      }),
    );
    await expect(
      fetchAndValidateCollection("ability-scores", duplicate),
    ).resolves.toHaveLength(2);
  });

  it("blocks an unreviewed pagination shape even if the first page count looks complete", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        count: 1,
        next: "/api/2024/ability-scores?offset=1",
        previous: null,
        results: [
          {
            index: "str",
            name: "STR",
            url: "/api/2024/ability-scores/str",
          },
        ],
      }),
    );
    await expect(
      fetchAndValidateCollection("ability-scores", fetchImpl),
    ).rejects.toThrow("is paginated");
  });

  it("rejects collection detail URLs that escape the expected API route", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        count: 1,
        results: [
          {
            index: "str",
            name: "STR",
            url: "https://attacker.example/collect",
          },
        ],
      }),
    );

    await expect(
      fetchAndValidateCollection("ability-scores", fetchImpl),
    ).rejects.toThrow(RulesApiError);
  });

  it("rejects same-origin detail URLs from a different collection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        count: 1,
        results: [
          {
            index: "carpenters-tools",
            name: "Carpenter's Tools",
            url: "/api/2024/equipment/carpenters-tools",
          },
        ],
      }),
    );

    await expect(
      fetchAndValidateCollection("proficiencies", fetchImpl),
    ).rejects.toThrow("unexpected detail route");
  });

  it("requires detail identity to match its collection summary", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        index: "dex",
        name: "Dexterity",
        full_name: "Dexterity",
      }),
    );
    await expect(
      fetchAndValidateDetail(
        "ability-scores",
        {
          index: "str",
          name: "STR",
          url: "/api/2024/ability-scores/str",
        },
        fetchImpl,
      ),
    ).rejects.toThrow("mismatched index");
  });

  it("uses canonical proficiency detail routes when the API summary has a known tool-prefix mismatch", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          count: 1,
          results: [
            {
              index: "carpenters-tools",
              name: "Carpenter's Tools",
              url: "/api/2024/proficiencies/tool-carpenters-tools",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          index: "carpenters-tools",
          name: "Carpenter's Tools",
          url: "/api/2024/proficiencies/tool-carpenters-tools",
        }),
      );

    const [item] = await fetchAndValidateCollection("proficiencies", fetchImpl);
    await expect(
      fetchAndValidateDetail("proficiencies", item, fetchImpl),
    ).resolves.toMatchObject({ index: "carpenters-tools" });
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      `${RULE_API_BASE_URL}/proficiencies/carpenters-tools`,
    );
  });

  it("retries rate-limited and server responses before succeeding", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(rootResponse()));

    await expect(fetchAndValidateApiRoot(fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
