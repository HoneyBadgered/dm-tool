import type {
  CombatView,
  CombatantView,
} from "@/server/services/combat/live-combat";
import { formatEvaluation } from "@/server/services/combat/expression";
import {
  overridesSchema,
  type Overrides,
  type Resolution,
} from "@/server/services/combat/resolution";
import {
  decodeRecord,
  resolveFor,
} from "@/server/services/combat/resolve-service";
import { confirmResolutionAction, rollAction } from "../actions";

export type ResolveParams = {
  res?: string;
  hit?: string;
  crit?: string;
  success?: string;
  final?: string;
  radj?: string | string[];
};

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const input =
  "mt-0.5 block w-full rounded border border-border bg-input px-2 py-1 text-sm";
const button =
  "rounded border border-border bg-input px-2 py-1 text-xs hover:bg-surface";
const primary =
  "rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:bg-primary-hover";

function parseOverrides(p: ResolveParams): Overrides {
  const adjustments: Record<string, string> = {};
  for (const raw of [p.radj ?? []].flat()) {
    const [key, value] = raw.split("=");
    if (key !== undefined && value) adjustments[key] = value;
  }
  const parsed = overridesSchema.safeParse({
    hit: p.hit || undefined,
    critical: p.crit || undefined,
    success: p.success || undefined,
    final: p.final && /^\d+$/.test(p.final) ? Number(p.final) : undefined,
    adjustments,
  });
  return parsed.success ? parsed.data : {};
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function ResolvePanel({
  combat,
  actor,
  params,
  open,
}: {
  combat: CombatView;
  actor: CombatantView;
  params: ResolveParams;
  open: boolean;
}) {
  if (!open || actor.status === "removed") return null;
  const record = decodeRecord(params.res);
  const overrides = parseOverrides(params);
  const resolution =
    record && record.actorId === actor.id
      ? resolveFor(combat, record, overrides)
      : null;
  const targets = combat.combatants.filter(
    (c) => c.id !== actor.id && c.status !== "removed",
  );
  const snapshot = actor.snapshot;
  const rollAs = rollAction.bind(null, combat.id, actor.id);
  const mode = (
    <label className="text-xs">
      Roll
      <select name="mode" className={input} defaultValue="normal">
        <option value="normal">Normal</option>
        <option value="advantage">Advantage</option>
        <option value="disadvantage">Disadvantage</option>
      </select>
    </label>
  );
  const manual = (
    <label className="text-xs">
      Physical d20 (blank = roll; two values for advantage/disadvantage)
      <input name="d20Manual" placeholder="e.g. 14" className={input} />
    </label>
  );

  return (
    <section
      className="mt-3 rounded border border-border bg-input p-2"
      aria-label="Dice and attacks"
    >
      <h3 className="font-semibold">Dice, attacks and saves</h3>
      <p className="text-xs text-muted">
        Rolls are previews. HP changes only after you confirm.
      </p>

      {resolution && record && (
        <Preview
          combat={combat}
          actor={actor}
          resolution={resolution}
          encoded={params.res!}
          overrides={overrides}
        />
      )}
      {params.res && !resolution && (
        <p role="alert" className="mt-2 text-sm text-danger">
          That roll can no longer be resolved (a combatant is gone or the link
          is invalid).
        </p>
      )}

      <details className="mt-2" open={!resolution}>
        <summary className="cursor-pointer text-sm font-medium">Attack</summary>
        <form action={rollAs} className="mt-1 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="kind" value="attack" />
          <label className="text-xs">
            Target
            <select name="targetId" required className={input} defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (AC {t.armorClass}, {t.currentHp}/{t.maxHp} HP)
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Attack from stat block
            <select name="preset" className={input} defaultValue="">
              <option value="">Custom</option>
              {snapshot?.attacks.map((a, i) => (
                <option key={`${a.name}-${i}`} value={i}>
                  {a.name}
                  {a.attackBonus !== null
                    ? ` (${signed(a.attackBonus)})`
                    : " (no bonus listed)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Name (blank = preset name)
            <input name="label" maxLength={80} className={input} />
          </label>
          <label className="text-xs">
            Attack bonus (blank = preset)
            <input
              name="bonus"
              type="number"
              min={-50}
              max={50}
              className={input}
            />
          </label>
          {mode}
          {manual}
          {[0, 1].map((i) => (
            <fieldset
              key={i}
              className="sm:col-span-2 grid gap-2 sm:grid-cols-3"
            >
              <label className="text-xs">
                Damage {i + 1} dice {i === 0 && "(blank = preset)"}
                <input
                  name={`dmgExpr${i}`}
                  placeholder="2d6+3"
                  maxLength={60}
                  className={input}
                />
              </label>
              <label className="text-xs">
                Type
                <input
                  name={`dmgType${i}`}
                  placeholder="slashing"
                  maxLength={40}
                  className={input}
                />
              </label>
              <label className="text-xs">
                Physical dice (blank = roll)
                <input
                  name={`dmgManual${i}`}
                  placeholder="4 6"
                  className={input}
                />
              </label>
            </fieldset>
          ))}
          <p className="sm:col-span-2 text-xs text-muted">
            For physical damage dice enter the normal roll only; if the attack
            is a critical hit the extra dice are rolled for you. Missing attack
            bonuses and damage are never guessed.
          </p>
          <div className="sm:col-span-2">
            <button className={primary}>Roll to hit</button>
          </div>
        </form>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium">
          Saving throw / ability check
        </summary>
        <form action={rollAs} className="mt-1 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            Type
            <select name="kind" className={input} defaultValue="save">
              <option value="save">Saving throw</option>
              <option value="check">Ability check</option>
            </select>
          </label>
          <label className="text-xs">
            Ability
            <select name="ability" className={input} defaultValue="DEX">
              {ABILITIES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Skill (checks only; used for the listed bonus)
            <input
              name="skill"
              placeholder="Stealth"
              maxLength={40}
              className={input}
            />
          </label>
          <label className="text-xs">
            DC
            <input
              name="dc"
              type="number"
              min={1}
              max={60}
              required
              className={input}
            />
          </label>
          <label className="text-xs">
            Bonus (blank = from stat block)
            <input
              name="bonus"
              type="number"
              min={-50}
              max={50}
              className={input}
            />
          </label>
          <label className="text-xs">
            Name (optional)
            <input name="label" maxLength={80} className={input} />
          </label>
          {mode}
          {manual}
          <label className="text-xs">
            Damage on failure (saves, optional)
            <input
              name="dmgExpr0"
              placeholder="8d6"
              maxLength={60}
              className={input}
            />
          </label>
          <label className="text-xs">
            Type
            <input
              name="dmgType0"
              placeholder="fire"
              maxLength={40}
              className={input}
            />
          </label>
          <label className="text-xs">
            Physical damage dice
            <input name="dmgManual0" className={input} />
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="halfOnSuccess" /> Half damage on a
            successful save
          </label>
          <p className="sm:col-span-2 text-xs text-muted">
            Saves and checks roll as {actor.name}. If the stat block lists no
            bonus, the ability modifier is used and labelled; with no stat
            block, enter a bonus.
          </p>
          <div className="sm:col-span-2">
            <button className={primary}>Roll</button>
          </div>
        </form>
      </details>
    </section>
  );
}

function Preview({
  combat,
  actor,
  resolution: r,
  encoded,
  overrides,
}: {
  combat: CombatView;
  actor: CombatantView;
  resolution: Resolution;
  encoded: string;
  overrides: Overrides;
}) {
  const isAttack = r.kind === "attack";
  const verdict = isAttack
    ? r.success
      ? r.critical
        ? "Critical hit"
        : "Hit"
      : "Miss"
    : r.success
      ? "Success"
      : "Failure";
  const d = r.d20;
  return (
    <div
      className="mt-2 rounded border border-primary bg-surface p-2"
      aria-label="Roll preview"
    >
      <p className="font-medium">{r.label}</p>
      <p>
        d20{" "}
        {d.mode === "normal"
          ? `[${d.values[0]}]`
          : `[${d.values.join(", ")}] ${d.mode} → ${d.natural}`}{" "}
        {signed(d.bonus)} = <strong>{d.total}</strong> vs{" "}
        {isAttack ? `AC ${r.targetAc}` : `DC ${r.dc}`} →{" "}
        <strong>{verdict}</strong>
        {r.automatic && ` (${r.automatic})`}
        {r.successOverridden && " (overridden)"}
        {r.criticalOverridden && " (critical overridden)"}
      </p>
      {r.parts.map((p, i) => (
        <p key={i} className="text-xs">
          {p.type ?? "untyped"}: {p.expr} → {formatEvaluation(p.evaluation)} ={" "}
          {p.evaluation.total}
        </p>
      ))}
      {r.groups.map((g) => {
        const key = (g.type ?? "").toLowerCase();
        return (
          <p key={key} className="text-xs">
            {g.type ?? "Untyped"}: {g.raw}
            {g.afterOutcome !== g.raw &&
              ` → ${g.afterOutcome} after save outcome`}
            {" → "}
            <strong>{g.adjusted}</strong> ({g.adjustment}
            {g.adjustment !== g.suggestion &&
              `, library suggests ${g.suggestion}`}
            ){g.suggestionNotes.map((n) => ` — ${n}`)}
          </p>
        );
      })}
      <p>
        Damage to {r.subject.name}: <strong>{r.calculated}</strong>
        {r.finalOverridden && (
          <>
            {" "}
            → overridden to <strong>{r.final}</strong>
          </>
        )}
      </p>
      <ul className="mt-1 list-disc pl-4 text-xs text-muted">
        {r.rulesNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <form method="get" className="mt-2 grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="selected" value={actor.id} />
        <input type="hidden" name="res" value={encoded} />
        {isAttack ? (
          <>
            <label className="text-xs">
              Hit
              <select
                name="hit"
                className={input}
                defaultValue={overrides.hit ?? ""}
              >
                <option value="">Calculated</option>
                <option value="hit">Force hit</option>
                <option value="miss">Force miss</option>
              </select>
            </label>
            <label className="text-xs">
              Critical
              <select
                name="crit"
                className={input}
                defaultValue={overrides.critical ?? ""}
              >
                <option value="">Calculated</option>
                <option value="critical">Force critical</option>
                <option value="normal">Not critical</option>
              </select>
            </label>
          </>
        ) : (
          <label className="text-xs">
            Result
            <select
              name="success"
              className={input}
              defaultValue={overrides.success ?? ""}
            >
              <option value="">Calculated</option>
              <option value="success">Force success</option>
              <option value="failure">Force failure</option>
            </select>
          </label>
        )}
        {r.groups
          .filter((g) => g.type)
          .map((g) => {
            const key = g.type!.toLowerCase();
            return (
              <label key={key} className="text-xs">
                {g.type} adjustment
                <select
                  name="radj"
                  className={input}
                  defaultValue={`${key}=${g.adjustment}`}
                >
                  {["none", "resistance", "vulnerability", "immunity"].map(
                    (a) => (
                      <option key={a} value={`${key}=${a}`}>
                        {a}
                      </option>
                    ),
                  )}
                </select>
              </label>
            );
          })}
        <label className="text-xs">
          Final damage override
          <input
            name="final"
            type="number"
            min={0}
            defaultValue={overrides.final ?? ""}
            className={input}
          />
        </label>
        <div className="flex items-end">
          <button className={button}>Recalculate</button>
        </div>
      </form>

      <form
        action={confirmResolutionAction.bind(
          null,
          combat.id,
          combat.version,
          actor.id,
        )}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="res" value={encoded} />
        {overrides.hit && (
          <input type="hidden" name="hit" value={overrides.hit} />
        )}
        {overrides.critical && (
          <input type="hidden" name="crit" value={overrides.critical} />
        )}
        {overrides.success && (
          <input type="hidden" name="success" value={overrides.success} />
        )}
        {overrides.final !== undefined && (
          <input type="hidden" name="final" value={overrides.final} />
        )}
        {r.groups
          .filter((g) => g.type)
          .map((g) => (
            <input
              key={g.type}
              type="hidden"
              name="adj"
              value={`${g.type!.toLowerCase()}=${g.adjustment}`}
            />
          ))}
        <label className="min-w-40 flex-1 text-xs">
          Note (optional)
          <input name="note" maxLength={120} className={input} />
        </label>
        <button className={primary}>
          {r.final > 0
            ? `Confirm: ${r.final} damage to ${r.subject.name}`
            : "Confirm: record, no damage"}
        </button>
      </form>
    </div>
  );
}
