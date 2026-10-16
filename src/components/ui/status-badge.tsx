import type { EncounterStatusValue } from "@/lib/validation/encounter";

const styles: Record<EncounterStatusValue, string> = {
  planned: "border-border bg-surface text-muted",
  active: "border-forest bg-forest text-white",
  resolved: "border-forest bg-white text-forest",
};

export function StatusBadge({ status }: { status: EncounterStatusValue }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
