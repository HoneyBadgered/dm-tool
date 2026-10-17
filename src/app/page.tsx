import { Suspense } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { listCampaigns } from "@/server/services/campaigns/campaigns";
import { listEncounters } from "@/server/services/encounters/encounters";
import { getRulesOverview } from "@/server/services/rules/rules";
import { listStorySessions } from "@/server/services/story/story";
import { listNpcs } from "@/server/services/npcs/npcs";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Your campaigns, table tools, and rules reference in one place.
      </p>
      <Suspense
        fallback={
          <div
            className="mt-4 h-40 animate-pulse rounded border border-border bg-surface"
            aria-busy="true"
            aria-label="Loading dashboard"
          />
        }
      >
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const [campaigns, npcs, encounters, sessions, rules] = await Promise.all([
    listCampaigns(),
    listNpcs(),
    listEncounters(),
    listStorySessions(),
    getRulesOverview(),
  ]);
  const importedCount = Object.values(rules.importedCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <>
      <section
        aria-label="Workspace summary"
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Summary label="Campaigns" value={campaigns.length} href="/campaigns" />
        <Summary label="NPCs" value={npcs.length} href="/npcs" />
        <Summary
          label="Open encounters"
          value={encounters.filter((item) => item.status !== "resolved").length}
          href="/encounters"
        />
        <Summary label="Story sessions" value={sessions.length} href="/story" />
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="Campaigns">
          <p>Manage campaign settings and organize ongoing stories.</p>
          <Link
            href="/campaigns"
            className="mt-2 inline-block text-forest underline"
          >
            View campaigns
          </Link>
        </Panel>
        <Panel title="Combat Tracker">
          <p>Track initiative, hit points, and turn order at the table.</p>
          <Link
            href="/combat"
            className="mt-2 inline-block text-forest underline"
          >
            Open combat tracker
          </Link>
        </Panel>
        <Panel title="NPCs and World Board">
          <p>
            {npcs.length} people across {campaigns.length} campaigns; browse
            people by recorded location.
          </p>
          <div className="mt-2 flex gap-3">
            <Link href="/npcs" className="text-forest underline">
              NPC directory
            </Link>
            <Link href="/world" className="text-forest underline">
              World Board
            </Link>
          </div>
        </Panel>
        <Panel title="Encounters">
          <p>
            {encounters.filter((item) => item.status !== "resolved").length}{" "}
            planned or active encounters.
          </p>
          <Link
            href="/encounters"
            className="mt-2 inline-block text-forest underline"
          >
            Manage encounters
          </Link>
        </Panel>
        <Panel title="Story Tracker">
          {sessions[0] ? (
            <p>
              Latest: {sessions[0].title || `Session ${sessions[0].number}`} for{" "}
              {sessions[0].campaignName}
            </p>
          ) : (
            <p>No session recaps recorded yet.</p>
          )}
          <Link
            href="/story"
            className="mt-2 inline-block text-forest underline"
          >
            Open story timeline
          </Link>
        </Panel>
        <Panel title="Rules Library">
          <p>
            {importedCount} imported reference records across available API
            categories.
          </p>
          <Link
            href="/rules"
            className="mt-2 inline-block text-forest underline"
          >
            Browse Rules Library
          </Link>
        </Panel>
      </section>
    </>
  );
}

function Summary({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded border border-border bg-surface p-4 hover:border-forest"
    >
      <span className="block text-sm text-muted">{label}</span>
      <span className="mt-1 block text-2xl font-semibold text-forest">
        {value}
      </span>
    </Link>
  );
}
