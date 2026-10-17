import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { getMonsterDetail } from "@/server/services/rules/rules";

export default function MonsterDetailPage({
  params,
}: PageProps<"/rules/monsters/[id]">) {
  return (
    <Suspense
      fallback={
        <Panel title="Loading monster stat block">
          Reading the imported creature record.
        </Panel>
      }
    >
      <MonsterDetailContent params={params} />
    </Suspense>
  );
}

async function MonsterDetailContent({
  params,
}: {
  params: PageProps<"/rules/monsters/[id]">["params"];
}) {
  const { id } = await params;
  const monster = await getMonsterDetail(id);
  if (!monster) notFound();

  const defenses = [
    ["Damage Vulnerabilities", monster.damageVulnerabilities],
    ["Damage Resistances", monster.damageResistances],
    ["Damage Immunities", monster.damageImmunities],
    ["Condition Immunities", monster.conditionImmunities],
  ] as const;

  return (
    <article className="mx-auto max-w-4xl">
      <Link href="/rules/monsters" className="text-sm text-forest underline">
        Back to monsters
      </Link>
      <header className="mt-2 rounded border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{monster.name}</h1>
            <p className="mt-1 text-sm italic text-muted">
              {monster.size} {monster.type}, {monster.alignment}
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Encounter integration is planned for a later phase."
            className="cursor-not-allowed rounded border border-border px-3 py-2 text-sm text-muted disabled:opacity-70"
          >
            Add to Encounter (coming soon)
          </button>
        </div>
        <p className="mt-3 border-t border-border pt-3 text-sm">
          <strong>Armor Class</strong> {monster.armorClass}
          {" · "}
          <strong>Hit Points</strong> {monster.hitPoints ?? "—"}
          {monster.hitDice && ` (${monster.hitDice})`}
          {" · "}
          <strong>Challenge</strong> {monster.challengeRating}
          {monster.experience !== null && ` (${monster.experience} XP)`}
        </p>
        {monster.speed.length > 0 && (
          <p className="mt-2 text-sm">
            <strong>Speed</strong> {monster.speed.join(", ")}
          </p>
        )}
      </header>

      <section className="mt-3 rounded border border-border bg-surface p-4">
        <h2 className="font-semibold text-forest">Ability Scores</h2>
        {monster.abilityScores.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No ability scores were provided in this source record.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
            {monster.abilityScores.map(({ label, value }) => (
              <div key={label} className="rounded border border-border p-2">
                <dt className="text-xs font-semibold text-muted">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
                <dd className="text-xs text-muted">{formatModifier(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-2">
        {monster.savingThrowsAndSkills.length > 0 && (
          <Panel title="Saving Throws and Skills">
            {monster.savingThrowsAndSkills.join(", ")}
          </Panel>
        )}
        {monster.senses.length > 0 && (
          <Panel title="Senses">{monster.senses.join(", ")}</Panel>
        )}
        {monster.languages.length > 0 && (
          <Panel title="Languages">{monster.languages.join(", ")}</Panel>
        )}
        {defenses.map(
          ([title, values]) =>
            values.length > 0 && (
              <Panel key={title} title={title}>
                {values.join(", ")}
              </Panel>
            ),
        )}
      </section>

      {monster.sections.map((section) => (
        <section key={section.title} className="mt-4">
          <h2 className="mb-2 text-base font-semibold">{section.title}</h2>
          <ul className="space-y-2">
            {section.entries.map((entry, index) => (
              <li key={`${entry.name}-${index}`}>
                <Panel title={entry.name}>
                  <p className="whitespace-pre-wrap">{entry.description}</p>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-4 text-xs text-muted">
        Source: {monster.source.srdLabel} via the D&D 5e API{" "}
        {monster.source.apiEdition}. Exact SRD revision{" "}
        {monster.source.verifiedSrdRevision
          ? `verified as ${monster.source.verifiedSrdRevision}`
          : "not verified against SRD 5.2.1"}
        .
      </p>
    </article>
  );
}

function formatModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return `${modifier >= 0 ? "+" : ""}${modifier}`;
}
