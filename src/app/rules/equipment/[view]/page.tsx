import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import {
  getEquipmentViewLabel,
  hasEquipmentView,
  listEquipmentView,
} from "@/server/services/rules/rules";

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
}>;

export default function EquipmentViewPage({
  params,
  searchParams,
}: PageProps<"/rules/equipment/[view]"> & { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading equipment">
          Checking imported equipment records.
        </Panel>
      }
    >
      <EquipmentViewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EquipmentViewContent({
  params,
  searchParams,
}: {
  params: PageProps<"/rules/equipment/[view]">["params"];
  searchParams: SearchParams;
}) {
  const [{ view }, paramsValue] = await Promise.all([params, searchParams]);
  if (!hasEquipmentView(view)) notFound();

  const label = getEquipmentViewLabel(view);
  const query = typeof paramsValue.q === "string" ? paramsValue.q.trim() : "";
  const selectedCategory =
    typeof paramsValue.category === "string" ? paramsValue.category : "";
  const overlongQuery = query.length > 100;
  const allItems = await listEquipmentView(view);
  const categories = [
    ...new Set(allItems.flatMap((item) => item.categoryLabels)),
  ].sort();
  const items = allItems.filter(
    (item) =>
      !overlongQuery &&
      (!query ||
        item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (!selectedCategory || item.categoryLabels.includes(selectedCategory)),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/rules" className="text-sm text-forest underline">
        Rules Library
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{label}</h1>
      <p className="mt-1 text-sm text-muted">
        Filtered from imported equipment records; an equipment item is stored
        once even if it appears in multiple views.
      </p>
      <nav
        aria-label="Equipment categories"
        className="mt-3 flex flex-wrap gap-2 text-sm"
      >
        {[
          ["all", "All Equipment"],
          ["weapons", "Weapons"],
          ["armor", "Armor"],
          ["adventuring-gear", "Adventuring Gear"],
        ].map(([key, viewLabel]) => (
          <Link
            key={key}
            href={`/rules/equipment/${key}`}
            aria-current={key === view ? "page" : undefined}
            className="rounded border border-border px-3 py-1.5 text-forest hover:border-forest"
          >
            {viewLabel}
          </Link>
        ))}
      </nav>

      <form
        action={`/rules/equipment/${view}`}
        className="mt-3 flex flex-wrap gap-2"
        role="search"
      >
        <label className="min-w-48 grow">
          <span className="sr-only">Filter equipment by name</span>
          <input
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="Filter by name"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">Filter equipment by category</span>
          <select
            name="category"
            defaultValue={selectedCategory}
            className="rounded border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All subcategories</option>
            {categories.map((categoryLabel) => (
              <option key={categoryLabel} value={categoryLabel}>
                {categoryLabel}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Filter list
        </button>
      </form>

      {overlongQuery ? (
        <Panel title="Filter is too long">
          Equipment filters must be 100 characters or fewer.
        </Panel>
      ) : items.length === 0 ? (
        <Panel title="No matching equipment">
          {allItems.length === 0
            ? "There are no imported equipment records in this category yet."
            : "No equipment matches the selected filters."}{" "}
          The importer does not fetch or substitute live API data while
          browsing.
        </Panel>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted" role="status">
            Showing {items.length} of {allItems.length} {label.toLowerCase()}{" "}
            records.
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/rules/entry/${item.id}`}
                  className="block h-full rounded border border-border bg-surface p-4 hover:border-forest"
                >
                  <h2 className="font-semibold text-forest">{item.name}</h2>
                  {item.description.length > 0 && (
                    <p className="mt-1 text-sm text-muted">
                      {item.description.join(" ")}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Source: {item.source.srdLabel} via D&amp;D 5e API{" "}
                    {item.source.apiEdition}; exact SRD revision{" "}
                    {item.source.verifiedSrdRevision
                      ? `verified as ${item.source.verifiedSrdRevision}`
                      : "not verified against SRD 5.2.1"}
                    .
                  </p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {item.cost && (
                      <>
                        <dt className="font-medium text-foreground">Cost</dt>
                        <dd>{item.cost}</dd>
                      </>
                    )}
                    {item.weight && (
                      <>
                        <dt className="font-medium text-foreground">Weight</dt>
                        <dd>{item.weight}</dd>
                      </>
                    )}
                    <dt className="font-medium text-foreground">Categories</dt>
                    <dd>{item.categoryLabels.join(", ")}</dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
