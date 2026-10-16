import Link from "next/link";
import { Panel } from "@/components/ui/panel";

const panels = [
  "Combat Tracker",
  "NPC Library",
  "World Board",
  "Story Tracker",
  "Player Portal",
  "Campaign Database",
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Placeholder overview. Features arrive in later phases.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="Encounters">
          <Link href="/encounters" className="text-forest underline">
            Manage encounters
          </Link>
        </Panel>
        {panels.map((title) => (
          <Panel key={title} title={title}>
            Coming soon.
          </Panel>
        ))}
      </div>
    </div>
  );
}
