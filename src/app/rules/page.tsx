import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import {
  getRulesOverview,
  RULE_CATEGORY_INFO,
} from "@/server/services/rules/rules";

const equipmentViews = [
  { href: "/rules/equipment/all", label: "All Equipment" },
  { href: "/rules/equipment/weapons", label: "Weapons" },
  { href: "/rules/equipment/armor", label: "Armor" },
  { href: "/rules/equipment/adventuring-gear", label: "Adventuring Gear" },
];

export default function RulesLibraryPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Rules Library</h1>
      <p className="mt-1 text-sm text-muted">
        Imported reference material is separate from campaign homebrew.
      </p>
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
            maxLength={100}
            placeholder="Search imported rules by name or source key"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
        >
          Search
        </button>
      </form>
      <Suspense
        fallback={
          <Panel title="Loading Rules Library">
            Checking imported source and category data.
          </Panel>
        }
      >
        <RulesLibraryContent />
      </Suspense>
    </div>
  );
}

async function RulesLibraryContent() {
  const overview = await getRulesOverview();
  const source = overview.source;

  return (
    <>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Panel title="Source and version">
          <p>
            {source
              ? `${source.srdLabel} via the D&D 5e API ${source.apiEdition} edition.`
              : "The D&D 5e API 2024 edition is the planned source; no source data has been imported."}
          </p>
          <p className="mt-2">
            {source?.verifiedSrdRevision
              ? `Verified against official SRD ${source.verifiedSrdRevision}.`
              : "The exact SRD revision has not been verified against SRD 5.2.1."}
          </p>
          {source && (
            <p className="mt-2">
              License:{" "}
              <a
                href={source.licenseUrl}
                className="text-forest underline"
                target="_blank"
                rel="noreferrer"
              >
                {source.licenseName}
              </a>
            </p>
          )}
        </Panel>

        <Panel title="Rules coverage">
          <p>
            The 2024 API has no standalone rules collection. This library cannot
            currently provide a complete searchable rules compendium.
          </p>
          <a
            href="https://www.dndbeyond.com/srd"
            className="mt-2 inline-block text-forest underline"
            target="_blank"
            rel="noreferrer"
          >
            Read the official System Reference Document
          </a>
        </Panel>
      </div>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Equipment</h2>
        <p className="mt-1 text-sm text-muted">
          Weapons, armor, and adventuring gear are filtered views of the
          upstream equipment collection. Each item is stored once.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {equipmentViews.map(({ href, label }) => (
            <Panel key={href} title={label}>
              <p>
                {overview.importedCounts.equipment ?? 0} imported equipment
                records in the library.
              </p>
              <Link
                href={href}
                className="mt-2 inline-block text-forest underline"
              >
                Browse {label.toLowerCase()}
              </Link>
            </Panel>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Import management</h2>
        <p className="mt-1 text-sm text-muted">
          Review recent preview/import/sync reports. Run operations remain
          explicit CLI actions requiring confirmation for writes.
        </p>
        <Link
          href="/rules/imports"
          className="mt-2 inline-block text-sm text-forest underline"
        >
          View import status and history
        </Link>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Available categories</h2>
        <p className="mt-1 text-sm text-muted">
          Counts include active imported records only; homebrew stays separate.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RULE_CATEGORY_INFO.map(({ value, label }) => (
            <li key={value}>
              <Link
                href={
                  value === "monsters"
                    ? "/rules/monsters"
                    : value === "equipment"
                      ? "/rules/equipment/all"
                      : `/rules/browse/${value}`
                }
                className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm hover:border-forest"
              >
                <span>{label}</span>
                <span className="text-muted">
                  {overview.importedCounts[value] ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {source && (
        <section className="mt-6 rounded border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-forest">
            Source attribution
          </h2>
          <p className="mt-2 text-sm text-muted">{source.attribution}</p>
        </section>
      )}
    </>
  );
}
