"use client";

export default function CombatError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-3xl rounded border border-red-700 bg-red-50 p-4 text-sm text-red-700"
    >
      <p className="font-medium">The combat could not be loaded or saved.</p>
      <p className="mt-1">
        Every confirmed change is already stored on the server, so nothing shown
        here is lost. Retry to reload the latest saved state; check the log
        before repeating an action that may have been applied.
      </p>
      <button
        onClick={reset}
        className="mt-3 rounded border border-red-700 bg-white px-3 py-1"
      >
        Retry
      </button>
    </div>
  );
}
