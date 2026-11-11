import Link from "next/link";
import type { CreatureSnapshot } from "@/lib/validation/combat";
import type {
  CombatView,
  CombatantView,
} from "@/server/services/combat/live-combat";
import type {
  ConditionDefinition,
  RuleLink,
} from "@/server/services/combat/conditions";
import { notesAction } from "../actions";

const linkClass =
  "text-link underline decoration-dotted hover:decoration-solid";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits text around known rule names and links each exact match. */
function linkify(text: string, links: RuleLink[], seen = new Set<string>()) {
  if (links.length === 0) return text;
  const byLower = new Map(links.map((l) => [l.name.toLowerCase(), l]));
  const names = [...byLower.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `\\b(${names.map(escapeRegExp).join("|")})\\b`,
    "gi",
  );
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const link = byLower.get(match[0].toLowerCase())!;
    out.push(text.slice(last, match.index));
    out.push(
      <Link
        key={`${match.index}-${link.id}`}
        href={`/rules/entry/${link.id}`}
        className={linkClass}
      >
        {match[0]}
      </Link>,
    );
    seen.add(link.id);
    last = match.index + match[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function Row({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p>
      <span className="font-medium">{label}</span> {items.join("; ")}
    </p>
  );
}

function SourceBadge({ snapshot }: { snapshot: CreatureSnapshot | null }) {
  const source = snapshot?.source;
  if (!snapshot)
    return (
      <span className="rounded border border-border px-1.5 py-0.5 text-xs">
        Custom — no stat block stored
      </span>
    );
  if (!source)
    return (
      <span className="rounded border border-magic bg-magic/15 px-1.5 py-0.5 text-xs text-magic">
        Custom / homebrew (no library source)
      </span>
    );
  return (
    <span className="rounded border border-primary bg-input px-1.5 py-0.5 text-xs text-link">
      Imported{source.srdLabel ? ` · ${source.srdLabel}` : ""}
      {source.ruleEntryId && (
        <>
          {" · "}
          <Link
            href={`/rules/entry/${source.ruleEntryId}`}
            className="underline"
          >
            library entry
          </Link>
        </>
      )}
    </span>
  );
}

/**
 * Renders only what the frozen snapshot holds. Nothing is fetched from the
 * library, so editing a library entry never changes a running combat.
 */
export function StatBlock({
  combatant: c,
  conditions,
  spells,
}: {
  combatant: CombatantView;
  conditions: ConditionDefinition[];
  spells: RuleLink[];
}) {
  const s = c.snapshot;
  const links: RuleLink[] = [
    ...conditions.map((d) => ({ id: d.id, name: d.name })),
  ];
  return (
    <details className="mt-3 rounded border border-border bg-input p-2" open>
      <summary className="cursor-pointer font-medium">
        Stat block <SourceBadge snapshot={s} />
      </summary>
      {!s ? (
        <p className="mt-2 text-muted">
          This combatant has no stored stat block. Its AC ({c.armorClass}) and
          HP ({c.maxHp}) are the values entered when it was added.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          <p>
            <span className="font-medium">AC</span> {c.armorClass}
            {c.armorClass !== s.armorClass && ` (library ${s.armorClass})`}
            {" · "}
            <span className="font-medium">HP</span> {s.maxHp}
            {s.hpRoll ? ` (${s.hpRoll})` : ""}
            {s.challengeRating !== null && (
              <>
                {" · "}
                <span className="font-medium">CR</span> {s.challengeRating}
                {s.experience !== null && ` (${s.experience} XP)`}
              </>
            )}
          </p>
          <Row label="Speed" items={s.speed} />
          {s.abilityScores.length > 0 && (
            <p className="flex flex-wrap gap-x-3">
              {s.abilityScores.map((a) => (
                <span key={a.label}>
                  <span className="font-medium">{a.label}</span> {a.value} (
                  {Math.floor((a.value - 10) / 2) >= 0 ? "+" : ""}
                  {Math.floor((a.value - 10) / 2)})
                </span>
              ))}
            </p>
          )}
          <Row
            label="Saves & skills"
            items={s.savingThrowsAndSkills.map((x) =>
              x.replace(/^(Saving Throw|Skill): /, ""),
            )}
          />
          <Row label="Vulnerabilities" items={s.damageVulnerabilities} />
          <Row label="Resistances" items={s.damageResistances} />
          <Row label="Immunities" items={s.damageImmunities} />
          <Row label="Condition immunities" items={s.conditionImmunities} />
          <Row label="Senses" items={s.senses} />
          <Row label="Languages" items={s.languages} />
          {s.sections.map((section) => (
            <div key={section.title} className="pt-2">
              <h3 className="border-b border-border font-semibold">
                {section.title}
              </h3>
              {section.entries.map((entry) => {
                const isSpellcasting = /spellcasting/i.test(entry.name);
                const rendered = linkify(
                  entry.description,
                  isSpellcasting ? [...links, ...spells] : links,
                );
                return (
                  <p key={entry.name} className="mt-1 whitespace-pre-wrap">
                    <span className="font-medium italic">{entry.name}</span>
                    {entry.usage && (
                      <span className="ml-1 rounded bg-surface px-1 text-xs">
                        {entry.usage}
                      </span>
                    )}
                    {". "}
                    {rendered}
                    {entry.save && (
                      <span className="ml-1 text-xs text-muted">
                        [DC {entry.save.dc} {entry.save.ability} save
                        {entry.save.successType === "half"
                          ? ", half damage on success"
                          : entry.save.successType === "none"
                            ? ", no damage on success"
                            : ""}
                        ]
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          ))}
          {!s.sections.some((x) => x.entries.some((e) => e.usage || e.save)) &&
            s.source && (
              <p className="pt-2 text-xs text-muted">
                Limited-use, recharge and save DC details appear only for
                combatants created after that data was captured; this one may
                predate it. Uses are shown, not tracked.
              </p>
            )}
        </div>
      )}
    </details>
  );
}

export function NotesForm({
  combat,
  combatant: c,
}: {
  combat: CombatView;
  combatant: CombatantView;
}) {
  return (
    <form
      action={notesAction.bind(null, combat.id, combat.version, c.id)}
      className="mt-3"
    >
      <label className="text-xs">
        Combatant notes (this combat only; the library entry is not changed)
        <textarea
          name="notes"
          defaultValue={c.notes ?? ""}
          rows={2}
          maxLength={1000}
          className="mt-0.5 block w-full rounded border border-border bg-input px-2 py-1 text-sm"
        />
      </label>
      <button className="mt-1 rounded border border-border bg-input px-2 py-0.5 text-xs hover:bg-surface">
        Save notes
      </button>
    </form>
  );
}
