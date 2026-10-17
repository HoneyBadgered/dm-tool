import type { Prisma } from "@/generated/prisma/client";

const HIDDEN_SOURCE_FIELDS = new Set(["index", "url", "updated_at"]);

export function RuleData({ value }: { value: Prisma.JsonValue }) {
  if (!isRecord(value)) {
    return <Value value={value} depth={0} />;
  }

  const entries = Object.entries(value).filter(
    ([key, field]) =>
      !HIDDEN_SOURCE_FIELDS.has(key) &&
      field !== null &&
      field !== undefined &&
      !(Array.isArray(field) && field.length === 0),
  );

  if (entries.length === 0) {
    return <p className="text-sm text-muted">No additional source details.</p>;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, field]) => {
        if (field === undefined) return null;
        return (
          <div
            key={key}
            className="min-w-0 rounded border border-border bg-surface p-3"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              {formatLabel(key)}
            </dt>
            <dd className="mt-1 break-words text-sm text-foreground">
              <Value value={field} depth={0} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Value({ value, depth }: { value: Prisma.JsonValue; depth: number }) {
  if (value === null) return <span className="text-muted">—</span>;
  if (typeof value === "string") return <span>{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (depth >= 4) {
    return <span className="text-muted">Nested source data</span>;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? (
      <span className="text-muted">None</span>
    ) : (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(value).filter(
    ([key, field]) =>
      !HIDDEN_SOURCE_FIELDS.has(key) &&
      field !== null &&
      !(Array.isArray(field) && field.length === 0),
  );
  if (entries.length === 0) return <span className="text-muted">—</span>;

  return (
    <dl className="space-y-2">
      {entries.map(([key, field]) => {
        if (field === undefined) return null;
        return (
          <div key={key}>
            <dt className="inline font-medium">{formatLabel(key)}: </dt>
            <dd className="inline">
              <Value value={field} depth={depth + 1} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
