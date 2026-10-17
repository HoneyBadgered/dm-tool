"use client";

export default function RulesError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-5xl rounded border border-border bg-surface p-4">
      <h1 className="font-semibold text-forest">Rules Library unavailable</h1>
      <p className="mt-2 text-sm text-muted">
        The library data could not be loaded. Please retry; if the problem
        continues, check the database connection and server logs.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded bg-forest px-3 py-2 text-sm text-white hover:bg-forest-dark"
      >
        Retry
      </button>
    </div>
  );
}
