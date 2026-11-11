import type { ReactNode } from "react";

export function Panel({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-link">{title}</h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </section>
  );
}
