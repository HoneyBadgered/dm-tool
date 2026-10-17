import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import {
  isRuleCategory,
  listRuleCategory,
  RULE_CATEGORY_INFO,
} from "@/server/services/rules/rules";

type SearchParams = Promise<{
  page?: string | string[];
  q?: string | string[];
}>;

export default function RuleCategoryPage({
  params,
  searchParams,
}: PageProps<"/rules/browse/[category]"> & { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading rules">
          Listing imported records in this category.
        </Panel>
      }
    >
      <RuleCategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RuleCategoryContent({
  params,
  searchParams,
}: {
  params: PageProps<"/rules/browse/[category]">["params"];
  searchParams: SearchParams;
}) {
  const [{ category: categoryValue }, paramsValue] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!isRuleCategory(categoryValue) || categoryValue === "equipment") {
    notFound();
  }

  const category = RULE_CATEGORY_INFO.find(
    (item) => item.value === categoryValue,
  );
  if (!category) notFound();

  const rawPage = typeof paramsValue.page === "string" ? paramsValue.page : "1";
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const query = typeof paramsValue.q === "string" ? paramsValue.q.trim() : "";
  const overlongQuery = query.length > 100;
  const result = overlongQuery
    ? {
        category: categoryValue,
        page,
        pageSize: 50,
        total: 0,
        pageCount: 0,
        items: [],
      }
    : await listRuleCategory(categoryValue, page, query);
  const currentPage = result.page;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/rules" className="text-sm text-forest underline">
        Rules Library
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{category.label}</h1>
      <p className="mt-1 text-sm text-muted">
        Browse active imported records. Results are alphabetical and paged 50 at
        a time; homebrew entries are kept separate.
      </p>

      <form
        action={`/rules/browse/${categoryValue}`}
        className="mt-4 flex flex-wrap gap-2"
        role="search"
      >
        <label className="grow">
          <span className="sr-only">Filter this list by name</span>
          <input
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder={`Filter ${category.label.toLowerCase()} by name`}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Filter list
        </button>
        {query && (
          <Link
            href={`/rules/browse/${categoryValue}`}
            className="rounded border border-border px-4 py-2 text-sm text-forest"
          >
            Clear
          </Link>
        )}
      </form>

      {overlongQuery ? (
        <Panel title="Filter is too long">
          Filter text must be 100 characters or fewer.
        </Panel>
      ) : result.total === 0 ? (
        <Panel title={query ? "No matching records" : "No imported records"}>
          {query
            ? `No imported ${category.label.toLowerCase()} match "${query}".`
            : `There are no imported ${category.label.toLowerCase()} yet.`}
        </Panel>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted" role="status">
            Showing {(currentPage - 1) * result.pageSize + 1}–
            {Math.min(currentPage * result.pageSize, result.total)} of{" "}
            {result.total} {category.label.toLowerCase()}.
          </p>
          <ul className="mt-3 space-y-2">
            {result.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/rules/entry/${item.id}`}
                  className="block rounded border border-border bg-surface p-4 hover:border-forest"
                >
                  <h2 className="font-semibold text-forest">{item.name}</h2>
                  {item.excerpt && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted">
                      {item.excerpt}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Source: {item.source.srdLabel} via D&amp;D 5e API{" "}
                    {item.source.apiEdition}; exact SRD revision{" "}
                    {item.source.verifiedSrdRevision ??
                      "not verified against SRD 5.2.1"}
                    .
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Rules list pages"
            className="mt-4 flex items-center justify-between"
          >
            {currentPage > 1 ? (
              <Link
                href={pageHref(categoryValue, currentPage - 1, query)}
                className="rounded border border-border px-3 py-2 text-sm text-forest"
              >
                Previous page
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted">
              Page {currentPage} of {result.pageCount}
            </span>
            {currentPage < result.pageCount ? (
              <Link
                href={pageHref(categoryValue, currentPage + 1, query)}
                className="rounded border border-border px-3 py-2 text-sm text-forest"
              >
                Next page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </div>
  );
}

function pageHref(category: string, page: number, query: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (query) params.set("q", query);
  return `/rules/browse/${category}?${params.toString()}`;
}
