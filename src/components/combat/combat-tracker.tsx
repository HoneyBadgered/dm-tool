"use client";

import { useEffect, useState } from "react";
import {
  addCombatant,
  applyHpDelta,
  emptyCombat,
  nextTurn,
  numberedNames,
  parseBulkName,
  parseHpDelta,
  previousTurn,
  removeCombatant,
  toggleCondition,
  type CombatState,
} from "@/server/services/combat/combat";

const STORAGE_KEY = "dm-tool:combat";
const CONDITIONS = [
  "Prone",
  "Stunned",
  "Poisoned",
  "Frightened",
  "Blinded",
  "Concentrating",
];

const input = "rounded border border-border bg-surface px-3 py-2 text-sm";
const btn =
  "rounded bg-forest px-3 py-2 text-sm text-white hover:bg-forest-dark";

export function CombatTracker() {
  const [state, setState] = useState<CombatState>(emptyCombat);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [init, setInit] = useState("10");
  const [hp, setHp] = useState("10");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw) setState(JSON.parse(raw) as CombatState);
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseBulkName(name);
    const maxHp = Number(hp);
    const initiative = Number(init);
    if (
      !parsed ||
      !Number.isFinite(maxHp) ||
      maxHp < 1 ||
      !Number.isFinite(initiative)
    ) {
      setError("Enter a name (e.g. “3 goblins”), initiative and HP ≥ 1.");
      return;
    }
    setError("");
    setState((s) => {
      let next = s;
      for (const n of numberedNames(parsed.name, parsed.count)) {
        next = addCombatant(next, {
          id: crypto.randomUUID(),
          name: n,
          initiative,
          hp: maxHp,
          maxHp,
          conditions: [],
        });
      }
      return next;
    });
    setName("");
  }

  function update(
    id: string,
    fn: (
      c: CombatState["combatants"][number],
    ) => CombatState["combatants"][number],
  ) {
    setState((s) => ({
      ...s,
      combatants: s.combatants.map((c) => (c.id === id ? fn(c) : c)),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Round {state.round}</span>
        <button className={btn} onClick={() => setState(previousTurn)}>
          Prev
        </button>
        <button className={btn} onClick={() => setState(nextTurn)}>
          Next turn
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-sm"
          onClick={() => setState(emptyCombat)}
        >
          End combat
        </button>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          aria-label="Name"
          className={`${input} flex-1`}
          placeholder="Name or “3 goblins”"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label="Initiative"
          className={`${input} w-20`}
          inputMode="numeric"
          value={init}
          onChange={(e) => setInit(e.target.value)}
        />
        <input
          aria-label="Max HP"
          className={`${input} w-20`}
          inputMode="numeric"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
        <button className={btn}>Add</button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <ul className="space-y-2">
        {state.combatants.map((c, i) => (
          <li
            key={c.id}
            className={`rounded border bg-surface p-3 ${i === state.turnIndex ? "border-forest ring-1 ring-forest" : "border-border"}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-8 text-sm text-muted">{c.initiative}</span>
              <span className="flex-1 font-medium">{c.name}</span>
              <span className={`text-sm ${c.hp === 0 ? "text-red-700" : ""}`}>
                {c.hp}/{c.maxHp} HP
              </span>
              <input
                aria-label={`HP change for ${c.name}`}
                placeholder="-7 / +5"
                className={`${input} w-24`}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const delta = parseHpDelta(e.currentTarget.value);
                  if (delta === null) return;
                  update(c.id, (x) => applyHpDelta(x, delta));
                  e.currentTarget.value = "";
                }}
              />
              <button
                className="text-sm text-muted underline"
                onClick={() => setState((s) => removeCombatant(s, c.id))}
              >
                Remove
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {CONDITIONS.map((cond) => (
                <button
                  key={cond}
                  aria-pressed={c.conditions.includes(cond)}
                  onClick={() => update(c.id, (x) => toggleCondition(x, cond))}
                  className={`rounded px-2 py-1 text-xs ${c.conditions.includes(cond) ? "bg-forest text-white" : "border border-border text-muted"}`}
                >
                  {cond}
                </button>
              ))}
            </div>
          </li>
        ))}
        {state.combatants.length === 0 && (
          <li className="text-sm text-muted">No combatants yet.</li>
        )}
      </ul>
    </div>
  );
}
