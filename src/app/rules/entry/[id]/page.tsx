import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RuleData } from "@/components/rules/rule-data";
import { Panel } from "@/components/ui/panel";
import {
  getRuleEntryDetail,
  RULE_CATEGORY_INFO,
} from "@/server/services/rules/rules";

export default function RuleEntryPage({
  params,
}: PageProps<"/rules/entry/[id]">) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading rule details">
          Reading the imported source record.
        </Panel>
      }
    >
      <RuleEntryContent params={params} />
    </Suspense>
  );
}

async function RuleEntryContent({
  params,
}: {
  params: PageProps<"/rules/entry/[id]">["params"];
}) {
  const { id } = await params;
  const entry = await getRuleEntryDetail(id);
  if (!entry) notFound();

  const category = RULE_CATEGORY_INFO.find(
    (item) => item.value === entry.category,
  );
  const backHref =
    entry.category === "equipment"
      ? "/rules/equipment/all"
      : `/rules/browse/${entry.category}`;

  return (
    <article className="mx-auto max-w-5xl">
      <Link href={backHref} className="text-sm text-forest underline">
        Back to {category?.label ?? "library"}
      </Link>
      <header className="mt-2 rounded border border-border bg-surface p-4">
        <p className="text-sm text-muted">{category?.label}</p>
        <h1 className="mt-1 text-xl font-semibold">{entry.name}</h1>
        <p className="mt-2 text-sm text-muted">
          Source identifier: <code>{entry.sourceKey}</code>
        </p>
        <p className="mt-2 text-xs text-muted">
          {entry.source.srdLabel} via D&amp;D 5e API {entry.source.apiEdition};
          exact SRD revision{" "}
          {entry.source.verifiedSrdRevision
            ? `verified as ${entry.source.verifiedSrdRevision}`
            : "not verified against SRD 5.2.1"}
          .
        </p>
      </header>

      <section className="mt-4">
        <h2 className="mb-2 text-base font-semibold">Source details</h2>
        <RuleData value={entry.rawData} />
      </section>
      <details className="mt-4 rounded border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-forest">
          View original API JSON
        </summary>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs text-muted">
          {JSON.stringify(entry.rawData, null, 2)}
        </pre>
      </details>
    </article>
  );
}
