import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { getRulesImportStatus } from "@/server/services/rules/rules";

export default function RulesImportsPage() {
  return (
    <Suspense
      fallback={
        <Panel title="Loading import status">
          Checking the latest recorded runs.
        </Panel>
      }
    >
      <RulesImportsContent />
    </Suspense>
  );
}

async function RulesImportsContent() {
  const status = await getRulesImportStatus();

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/rules" className="text-sm text-forest underline">
        Rules Library
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Import status and history</h1>
      <p className="mt-1 text-sm text-muted">
        Preview runs never write rule entries. Imports and syncs require an
        explicit CLI confirmation; this page is read-only.
      </p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <Panel title="Last successful write run">
          {status.lastFetchedAt ? (
            <time dateTime={status.lastFetchedAt.toISOString()}>
              {status.lastFetchedAt.toLocaleString()}
            </time>
          ) : (
            <p>No successful import or sync has completed.</p>
          )}
        </Panel>
        <Panel title="Latest run">
          {status.runs[0] ? (
            <>
              <p>
                {status.runs[0].mode} — {status.runs[0].status}
              </p>
              <p className="mt-1">
                {status.runs[0].summary ?? "Run completed without a summary."}
              </p>
            </>
          ) : (
            <p>No import runs have been recorded yet.</p>
          )}
        </Panel>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Run commands</h2>
        <p className="mt-1 text-sm text-muted">
          Review a preview report before importing. Write modes need{" "}
          <code>--confirm</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-border bg-surface p-3 text-xs">
          <code>{`npm run rules:preview
npm run rules:import -- --confirm
npm run rules:sync -- --confirm`}</code>
        </pre>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Recent runs</h2>
        {status.runs.length === 0 ? (
          <Panel title="No run history">
            The first preview will appear here after running the preview
            command.
          </Panel>
        ) : (
          <ul className="mt-3 space-y-3">
            {status.runs.map((run) => (
              <li key={run.id}>
                <Panel title={`${run.mode} — ${run.status}`}>
                  <p>
                    {run.collection ?? "All API collections"} ·{" "}
                    {run.writesEnabled ? "writes enabled" : "read-only preview"}
                  </p>
                  <p className="mt-1">
                    <time dateTime={run.startedAt.toISOString()}>
                      {run.startedAt.toLocaleString()}
                    </time>
                    {run.completedAt &&
                      ` · finished ${run.completedAt.toLocaleString()}`}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                    <Metric label="Discovered" value={run.discovered} />
                    <Metric label="Valid" value={run.valid} />
                    <Metric label="Invalid" value={run.invalid} />
                    <Metric label="Created" value={run.created} />
                    <Metric label="Updated" value={run.updated} />
                    <Metric label="Unchanged" value={run.unchanged} />
                    <Metric label="Skipped" value={run.skipped} />
                    <Metric label="Deactivated" value={run.deactivated} />
                  </dl>
                  {run.summary && <p className="mt-2">{run.summary}</p>}
                  {run.errors.length > 0 && (
                    <div className="mt-3 rounded border border-border p-3">
                      <h3 className="font-medium text-foreground">
                        Recorded errors ({run.errors.length})
                      </h3>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {run.errors.slice(0, 10).map((error, index) => (
                          <li
                            key={`${error.collection}-${error.stage}-${index}`}
                          >
                            {error.collection ?? "Run"} / {error.stage}:{" "}
                            {error.message}
                          </li>
                        ))}
                      </ul>
                      {run.errors.length > 10 && (
                        <p className="mt-1">
                          Showing the first 10 stored errors.
                        </p>
                      )}
                    </div>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
