import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import {
  isRuleCategory,
  RULE_CATEGORY_INFO,
  searchRuleEntries,
} from "@/server/services/rules/rules";

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
}>;

export default function RulesSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <Panel title="Searching imported rules">
          Loading matching records.
        </Panel>
      }
    >
      <RulesSearchContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RulesSearchContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const categoryValue =
    typeof params.category === "string" ? params.category : undefined;
  const category =
    categoryValue && isRuleCategory(categoryValue) ? categoryValue : undefined;
  const categoryLabel = RULE_CATEGORY_INFO.find(
    (item) => item.value === category,
  )?.label;
  const invalidCategory = categoryValue !== undefined && category === undefined;
  const overlongQuery = query.length > 100;
  const results =
    query && !overlongQuery && !invalidCategory
      ? await searchRuleEntries(query, category)
      : [];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/rules" className="text-sm text-forest underline">
        Rules Library
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Search Rules Library</h1>
      <form
        action="/rules/search"
        className="mt-4 flex flex-wrap gap-2"
        role="search"
      >
        <label className="grow">
          <span className="sr-only">Search imported rules by name</span>
          <input
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="Search names or source keys"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Search
        </button>
      </form>

      {categoryLabel && (
        <p className="mt-3 text-sm text-muted">
          Category: {categoryLabel}.{" "}
          <Link href="/rules/search" className="text-forest underline">
            Search all categories
          </Link>
        </p>
      )}
      {overlongQuery ? (
        <Panel title="Search is too long">
          Search terms must be 100 characters or fewer.
        </Panel>
      ) : invalidCategory ? (
        <Panel title="Unsupported category">
          Choose a category from the Rules Library overview.
        </Panel>
      ) : !query ? (
        <Panel title="Enter a search term">
          Search imported record names and stable source identifiers. This
          search does not include campaign homebrew or the full text of every
          source payload.
        </Panel>
      ) : results.length === 0 ? (
        <Panel title="No matching imported records">
          No imported entries match &ldquo;{query}&rdquo;
          {categoryLabel ? ` in ${categoryLabel}` : ""}. The source may not have
          been imported yet.
        </Panel>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {results.length === 100
              ? "Showing the first 100 matches."
              : `${results.length} matching imported ${results.length === 1 ? "record" : "records"}.`}
          </p>
          <ul className="mt-3 space-y-2">
            {results.map((result) => {
              const label = RULE_CATEGORY_INFO.find(
                (item) => item.value === result.category,
              )?.label;
              return (
                <li key={result.id}>
                  <Link
                    href={
                      result.category === "monsters"
                        ? `/rules/monsters/${result.id}`
                        : `/rules/entry/${result.id}`
                    }
                    className="block rounded border border-border bg-surface p-4 hover:border-forest"
                  >
                    <h2 className="font-semibold text-forest">{result.name}</h2>
                    <p className="mt-1 text-sm text-foreground">{label}</p>
                    {result.excerpt && (
                      <p className="mt-1 text-sm text-muted">
                        {result.excerpt}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      Source: {result.source.srdLabel} via D&D 5e API{" "}
                      {result.source.apiEdition}; exact SRD revision{" "}
                      {result.source.verifiedSrdRevision
                        ? `verified as ${result.source.verifiedSrdRevision}`
                        : "not verified against SRD 5.2.1"}
                      .
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
