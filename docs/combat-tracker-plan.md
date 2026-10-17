# Combat Tracker Plan

Status: **plan only. No tracker features, migrations, or data changes have been made.**
Audit date: 2026-10-17. Verified against the repository and the current local database (read-only `SELECT`s).

## 1. Audit summary

### What exists today

| Area                    | Current state                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/combat`               | A **client-only** tracker (`src/components/combat/combat-tracker.tsx`) that persists to `localStorage` under `dm-tool:combat`. It is not connected to campaigns, encounters, the rules library, or the database.                                                       |
| Pure combat logic       | `src/server/services/combat/combat.ts` (+ tests): `sortByInitiative`, `addCombatant`, `removeCombatant`, `nextTurn`, `previousTurn`, `parseHpDelta`, `applyHpDelta`, `toggleCondition`, `parseBulkName`, `numberedNames`. Turn position is tracked by **array index**. |
| `Encounter`             | Minimal: `campaignId`, `title`, `status` (`planned`/`active`/`resolved`), `notes`, soft delete. **No lineup of creatures.** Status transitions: `planned→active`, `active→resolved`, `active→planned`; `resolved` is terminal (`src/lib/validation/encounter.ts`).     |
| `PlayerCharacter`       | Model exists (`name`, `playerName`, `maxHp`, `armorClass`, soft delete) but has **no UI, service, or validation**. No ability scores, initiative bonus, or conditions.                                                                                                 |
| `Npc`                   | `name`, `role`, `location`, `notes`. **No stats.**                                                                                                                                                                                                                     |
| `RuleEntry` (rules lib) | Imported 2024 API data, plus `origin = homebrew` support. Monsters (341), conditions (15), spells (339), equipment (182), damage types (13), features, traits, etc. `rawData` is the verbatim API JSON; `contentHash` and `isActive` track changes.                    |
| Monster parsing         | `getMonsterDetail` / `listMonsters` in `src/server/services/rules/rules.ts` already parse AC, HP, speed, ability scores, saves/skills, resistances, senses, and action sections. **Reuse this; do not write a second monster parser.**                                 |
| Service pattern         | Services accept an injected `db` (`Pick<PrismaClient, ...>`), validate with zod, throw typed errors; server actions in `actions.ts` map errors to messages; tests mock the db object (no live DB in tests).                                                            |
| UI conventions          | Tailwind with `border-border`, `bg-surface`, `forest` palette; `Panel`, `StatusBadge`; plain server components with `Suspense` and `loading/error` states; `?notice=` redirects for mutations; shared `app-shell.tsx` nav (Combat link already present).               |
| Auth                    | **None.** No middleware/proxy, sessions, or user model. Server actions are open to anyone who can reach the server.                                                                                                                                                    |
| Infra                   | `docker-compose.yml` defines `db` (Postgres 17). Another Postgres container, `alchemy-postgres`, runs on the same host and belongs to a **separate project that must not be touched**. Local DB container for this project: `dmtool-postgres`.                         |

### Verified source data (live DB, read-only)

These facts constrain the design:

1. **Monsters have no `initiative` field** (0 of 341). Raw monster keys include `hit_points`, `hit_points_roll`, `hit_dice`, `armor_class[]`, `speed{}`, six ability scores, `proficiency_bonus`, `actions[]` (with `attack_bonus` and `damage[].damage_dice` where structured), `bonus_actions`, `reactions`, `legendary_actions` (32 monsters), `special_abilities`, `damage_*`, `condition_immunities`, `senses`, `languages`, `challenge_rating`, `xp`.
2. **Conditions are prose-only.** 15 entries (Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious), each `{index, name, description}`. There is no machine-readable mechanics, so **conditions must not be auto-enforced**.
3. **No standalone rules endpoint** exists (documented in `docs/srd-ingestion-plan.md`). Initiative, temp HP, death saves, and cover rules text is **not in the library**. The tracker is a DM bookkeeping tool; it must not claim to enforce rules it has no source text for.
4. The source is labelled SRD 5.2 by the API; parity with Wizards' SRD 5.2.1 is **unverified**. Anything the tracker shows from the library must keep the existing source attribution.
5. Existing `damage_resistances` / `damage_immunities` / `damage_vulnerabilities` are arrays of strings parsed by the current monster detail code. They are free text (some include qualifiers), so damage modifiers can only be **suggested**, never silently applied.

### Gaps relative to the goals

- Live combat is not persistent across devices/browsers and cannot be shared with encounters or campaigns.
- Turn pointer by index breaks when a combatant is removed, added mid-round, or ties are reordered.
- `applyHpDelta` has no temp HP, no overkill tracking, and is clamped, which hides information needed for undo.
- No event history, undo, or crash recovery beyond one browser's `localStorage`.
- Encounters cannot hold a creature lineup; `Encounter.status = active` has no link to anything live.

## 2. Core concepts (three separate layers)

```
Creature template ──(referenced by)──► Encounter template ──(instantiated into)──► Live combat
(rules/NPC/PC)                         (lineup + config)                           (mutable state)
 never mutated by combat                edited in planning only                    snapshot copies, event log
```

### 2.1 Creature template (reusable reference)

**Do not create a new "creature" table that duplicates existing data.** A creature template is a _resolved view_ over existing sources:

| Kind    | Source of truth                                                    | Notes                                                                                      |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Monster | `RuleEntry` where `category = monsters` (imported **or** homebrew) | Parsed by the existing `getMonsterDetail`. Homebrew monsters use `origin = homebrew`.      |
| NPC     | `Npc` + optional link to a monster `RuleEntry` as its stat basis   | Additive nullable columns on `Npc` (see §3.4). NPCs without a stat basis get manual stats. |
| PC      | `PlayerCharacter`                                                  | Needs a small additive extension (initiative modifier, optional passive perception).       |
| Ad hoc  | Typed inline on the encounter row/combatant                        | One-off "Bandit Captain" with name/AC/HP; no library link.                                 |

A new service `creature-templates.ts` exposes `resolveCreatureTemplate(ref)` which returns a normalized `CreatureSnapshotInput`: `{ kind, name, ac, maxHp, hpRoll, speed, abilityScores, initiativeModifier, actions[], conditionImmunities[], resistances[], source }`. It never writes to the source rows.

### 2.2 Encounter template (reusable lineup)

Extend the **existing `Encounter`** model rather than creating a competing one. Add a child table `EncounterEntry` for the lineup (creature ref + quantity + overrides + hidden/reinforcement flags). `Encounter.status` keeps its current meaning (`planned` → `active` → `resolved`) but gains a link to the live combat while active.

### 2.3 Live combat (mutable)

New models `Combat`, `Combatant`, `CombatEvent`. Starting a combat **copies** a stat snapshot into each `Combatant` (copy-on-start). Later library re-imports or homebrew edits **never change a running combat**. The snapshot stores the `ruleEntryId` and `contentHash` it was built from so the UI can offer "template changed since start" informationally.

## 3. Data model (additive migrations only)

All changes are **new tables/columns or new enum values appended**; no drops, renames, or type changes. Prisma syntax is illustrative; final field names to be settled in Phase 2.

### 3.1 `EncounterEntry` (template lineup)

```prisma
model EncounterEntry {
  id             String   @id @default(cuid())
  encounterId    String
  encounter      Encounter @relation(fields: [encounterId], references: [id], onDelete: Cascade)
  kind           CreatureKind          // monster | npc | player_character | custom
  ruleEntryId    String?               // monster stat basis (imported or homebrew)
  ruleEntry      RuleEntry? @relation(fields: [ruleEntryId], references: [id], onDelete: Restrict)
  npcId          String?
  playerCharacterId String?
  label          String                // display name, e.g. "Goblin Warrior"
  quantity       Int      @default(1)  // 1..N, numbered at instantiation
  overrides      Json?                 // validated shape: maxHp, ac, initiativeModifier, notes
  startsHidden   Boolean  @default(false)
  wave           Int      @default(0)  // 0 = starts in combat; >0 = reinforcement group
  sortOrder      Int      @default(0)
  @@index([encounterId])
}
```

Use `Restrict` on `ruleEntryId` so a library entry referenced by an encounter cannot be hard-deleted (the importer only deactivates, never deletes, so this is consistent).

### 3.2 `Combat` (one live run)

```prisma
model Combat {
  id             String       @id @default(cuid())
  campaignId     String
  encounterId    String?      // null = ad hoc combat
  status         CombatStatus @default(setup)   // setup | running | paused | ended
  round          Int          @default(1)
  activeCombatantId String?
  version        Int          @default(0)       // optimistic concurrency
  eventSeq       Int          @default(0)       // last assigned event sequence
  startedAt      DateTime?
  endedAt        DateTime?
  createdAt / updatedAt
  @@index([campaignId, status])
}
```

Integrity rule: **at most one non-ended Combat per Encounter** via a partial unique index added in the migration SQL (`WHERE "status" <> 'ended' AND "encounterId" IS NOT NULL`). Prisma cannot express this natively; add by hand in migration SQL and document it in the schema comment.

### 3.3 `Combatant` and `CombatEvent`

```prisma
model Combatant {
  id            String   @id @default(cuid())
  combatId      String
  combat        Combat   @relation(fields: [combatId], references: [id], onDelete: Cascade)
  kind          CreatureKind
  name          String               // numbered: "Goblin 2"
  side          CombatSide           // party | enemy | neutral
  sourceRuleEntryId  String?         // reference only; no cascade
  sourceContentHash  String?
  sourceNpcId        String?
  sourcePlayerCharacterId String?
  statSnapshot  Json                 // frozen CreatureSnapshot (AC, speed, scores, actions, attribution)
  maxHp         Int
  currentHp     Int
  tempHp        Int      @default(0)
  armorClass    Int
  initiative    Int?                 // null until rolled/entered
  initiativeTieBreak Int @default(0) // stable manual ordering
  conditions    Json     @default("[]")  // [{ruleEntryIndex, name, source, durationNote, level?, addedRound}]
  isHidden      Boolean  @default(false)
  isActive      Boolean  @default(true)  // false = defeated/removed, kept for history/undo
  wave          Int      @default(0)
  notes         String?
  @@index([combatId])
}

model CombatEvent {
  id          String   @id @default(cuid())
  combatId    String
  combat      Combat   @relation(fields: [combatId], references: [id], onDelete: Cascade)
  seq         Int                      // monotonically increasing per combat
  type        CombatEventType
  actorCombatantId  String?
  targetCombatantId String?
  round       Int
  payload     Json                     // typed per `type`: { before, after, roll?, note? }
  undoneBySeq Int?                     // set when a later UNDO event reverses this one
  idempotencyKey String?               // dedupes double-submits
  createdAt   DateTime @default(now())
  @@unique([combatId, seq])
  @@unique([combatId, idempotencyKey])
}
```

Event types: `combat_started`, `initiative_set`, `turn_advanced`, `round_advanced`, `damage`, `heal`, `temp_hp_set`, `condition_added`, `condition_removed`, `combatant_added`, `combatant_removed`, `combatant_revealed`, `combatant_hidden`, `note`, `dice_roll`, `attack_roll`, `undo`, `combat_ended`.

Every mutating event stores `before` and `after` for the fields it touched, so undo is a computed inverse. The log is append-only; rows are never edited or deleted (an undo adds an `undo` event and sets `undoneBySeq` on the original).

### 3.4 Extensions to existing models (nullable/additive)

- `Npc`: `statRuleEntryId String?` (monster used as stat basis) and `statOverrides Json?`.
- `PlayerCharacter`: `initiativeModifier Int @default(0)`; optionally `passivePerception Int?`. Existing rows keep defaults. No existing values are rewritten.
- `Encounter`: `currentCombatId String?` is **not** added; derive from `Combat.encounterId` instead to avoid a two-way pointer that can drift.
- `EncounterStatus` is **not** modified. `planned/active/resolved` already covers it; `active` is set when a combat starts and `resolved` when it ends.

### 3.5 Homebrew separation

Homebrew creatures are stored as `RuleEntry` rows with `origin = homebrew` and `category = monsters`, matching the existing separation rule (importer never writes them; sync never deactivates them). Combat never writes to any `RuleEntry`. Statistic overrides live on `EncounterEntry.overrides` or `Combatant`, never on the source.

## 4. Behavior design

### 4.1 Encounter creation and editing

- Edit lineup on the existing `/encounters/[id]` page; add an "Lineup" panel: search the monster library (reuse `listMonsters` filters by name/CR/type), add NPCs and PCs from the campaign, add custom creatures.
- Quantity with automatic numbering at instantiation (reuse `parseBulkName` and `numberedNames`).
- Per-entry flags: starts hidden, reinforcement wave, HP mode (`average` | `roll hit_points_roll` | `manual`).
- Summary row: total creatures, total XP from imported `xp`, CR spread. **No difficulty/budget calculator** (the verified source has no encounter-building rules text).
- Editing is allowed only while `Encounter.status = planned`. Active/resolved encounters' lineups are read-only; a running combat edits `Combatant` rows instead.

### 4.2 Initiative and turn progression

- Initiative is a **DM-entered integer** per combatant. The tracker may _suggest_ a modifier from the DEX score in the verified stat data (`floor((DEX−10)/2)`) and offer a "roll d20 + modifier" helper, clearly labelled as a convenience since the library has no initiative rule text or initiative field.
- Ordering: `initiative` desc, then `initiativeTieBreak` asc (manual drag/arrows), then stable `id`. Replaces the existing index-only sort.
- The turn pointer is `Combat.activeCombatantId` (not an array index) plus `round`. Adding/removing/reordering a combatant never changes whose turn it is unless the active combatant itself is removed (then advance to the next active combatant in order).
- Next/previous skips `isActive = false` combatants. Round increments when wrapping.
- Delay/ready: manual "move after X" reorder through the tie-break field; logged as `initiative_set`.
- Start combat requires every combatant that is not hidden-and-unrevealed to have an initiative, or an explicit DM "start anyway" that places unrolled combatants last.

### 4.3 Combatant stat blocks

- Render from `Combatant.statSnapshot` using the same presentation components as `/rules/monsters/[id]` (extract the stat-block rendering into a shared component rather than copying it).
- Show source attribution and the existing "SRD 5.2.1 parity unverified" note.
- Action rows with structured `attack_bonus` and `damage[].damage_dice` get inline roll buttons (see §4.5). Prose-only actions get a copy/"note to log" button but no automation.

### 4.4 HP, temp HP, damage, healing

- Store `currentHp`, `tempHp`, `maxHp` as ints. Validate `0 ≤ currentHp ≤ maxHp`, `tempHp ≥ 0`.
- Damage input consumes temp HP first, then current HP; the log event records `{ requested, absorbedByTemp, appliedToHp, overkill, before, after }`.
- Temp HP set: DM chooses replace or keep-higher; the tracker does not decide the rule (no source text). Default shown as keep-higher, editable.
- Healing caps at `maxHp` and records `wasted`.
- At 0 HP the combatant is **flagged**, not removed. Automatic death/unconscious/exhaustion handling is **out of scope** (no verified rules text); the DM applies conditions manually.
- Optional resistance/vulnerability suggestion: if a damage type is chosen and the snapshot text lists it in resistances/vulnerabilities/immunities, show a hint to halve/double/zero; the DM confirms the number. Never auto-applied because qualifier text is free-form.
- Max HP adjustments are explicit events.

### 4.5 Conditions and ongoing effects

- The picker is **populated from the active `conditions` rule entries** (15 verified), with description shown from the library on hover/expand. Free-text custom effects are also allowed and clearly marked "custom".
- A condition instance records: library reference, optional duration note, optional `endsAtRound`/`endsOnTurnOf`, applied-by, and (for Exhaustion) an integer level **only after the Exhaustion text is read and confirmed in Phase 5**; until then it is a plain tag.
- Ongoing effects (e.g. "burning 1d6 at start of turn") are **reminders**: at the relevant turn boundary the UI surfaces "Effects due" with a button to apply the damage/healing, never automatically.
- Condition immunities in the snapshot trigger a warning, not a block.
- Remove expired reminders when their round is passed, with confirmation.

### 4.6 Dice and attack resolution

- Pure, injectable-RNG dice module: parse `NdM±K`, support multiple terms, advantage/disadvantage on d20, crit doubling of dice only as an option flag (labelled; rules text for crits isn't in the library).
- Server-side rolling for logged rolls (so the log is authoritative); a client "manual result" field is available when the DM rolls physical dice.
- Attack resolution is a **DM-assisted flow**: select attacker/action → target → roll or enter d20 → compare to target `armorClass` → show hit/miss/crit suggestion → on hit, prefill damage dice from `damage[]` → DM confirms → writes `attack_roll` and `damage` events as one transaction. Advantage/disadvantage and cover are manual toggles. No automatic cover/line-of-sight (out of scope).

### 4.7 Combat log, undo, autosave, recovery

- **Server is the source of truth.** Every command is a server action that writes the state change and its `CombatEvent` in one transaction. There is no client-side authoritative state.
- Log panel: chronological, filterable by round/combatant/type; hidden-combatant events flagged DM-only.
- **Undo**: undo the most recent not-yet-undone event; the service computes the inverse from `before`/`after`, applies it only if current values still match `after` (otherwise returns a conflict and offers "force"). Undo and redo of turn advancement is supported; undone events remain visible (struck through).
- **Autosave**: implicit; each action is persisted when it returns. The client shows saving/saved/error status and retries idempotent commands (same `idempotencyKey`) on network failure.
- **Recovery**: `/combat` lists non-ended combats; reopening rebuilds the view from `Combat` + `Combatant` rows. A one-click "export combat log as JSON" is included for DM safety. `localStorage` is used only for UI preferences (panel layout, last filters), never for combat state.
- **Legacy local combat**: on first load of the new `/combat`, if the old `dm-tool:combat` key exists, offer a one-time "Import saved local combat into a new combat" (create as ad hoc, `side = enemy` unknown → prompt). Do not delete the key automatically; leave removal to the user.

### 4.8 Hidden combatants and reinforcements

- `isHidden` combatants are visible to the DM with a visual badge; they still hold initiative slots (the DM can see where they would act).
- "Reveal" / "Hide" are logged events. Reveal can be done inline at any time.
- **Hidden data must be filtered on the server**, not hidden with CSS. If/when a player-facing read-only view exists, it uses a separate projection function that excludes hidden combatants, their log events, and snapshot internals such as exact HP unless the DM enables it. That view is **gated by the authorization work (§6)** and is not part of the first release.
- Reinforcements: `EncounterEntry.wave > 0` entries show as "Reserve" in the combat sidebar; "Add wave N" instantiates them into the live order (optionally hidden), asks for initiative, and logs `combatant_added` events. Ad hoc reinforcements can be added from the library or as custom creatures.

## 5. UI layout

### Routes

| Route              | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `/combat`          | Combat hub: resume running/paused combats, start from a planned encounter, start ad hoc, past combats. |
| `/combat/[id]`     | Live DM console.                                                                                       |
| `/combat/[id]/log` | Full log with filters and export.                                                                      |
| `/encounters/[id]` | Existing page, extended with the lineup editor and a "Start combat" action.                            |

The existing `/combat` route and nav entry are reused; no new top-level nav item.

### Live console layout (desktop)

```
┌ Header: Round N · Active: <name> · [Prev][Next turn] · saved ✓ · [Undo] [Pause][End] ──────┐
├ Initiative order (left, 1/3) ┬ Active combatant stat block (center, 1/3) ┬ Log + tools (right) ┤
│ rows: init, name, AC, HP bar, │ full stat block from snapshot,            │ recent log,         │
│ temp HP, condition chips,     │ action buttons (roll/attack),             │ dice roller,        │
│ hidden/defeated badges        │ conditions + notes                        │ reserve waves       │
└──────────────────────────────┴───────────────────────────────────────────┴────────────────────┘
```

- Mobile/tablet: tabs (Order / Active / Log); HP quick buttons are large touch targets.
- States: loading skeleton, empty combat, conflict banner ("combat changed elsewhere, refresh"), save error banner with retry, ended (read-only summary).
- Reuse `Panel`, `StatusBadge`, form input/button class tokens; extract the stat-block renderer from the monsters page into `src/components/rules/stat-block.tsx`.

## 6. Integrity, concurrency, validation, authorization

### Data integrity

- Every mutation in a single `$transaction`: state change + event + `Combat.version` bump + `eventSeq` increment.
- Combatant rows belong to exactly one combat (`onDelete: Cascade` from `Combat`); `Combat` is never hard-deleted by the app (soft "ended" status; only an explicit, confirmed "delete combat" action may remove it, and it must be guarded).
- FKs to `RuleEntry`, `Npc`, `PlayerCharacter` are **reference-only, `SetNull`/`Restrict` as appropriate** with snapshot fallback, so deleting or re-importing a source cannot corrupt a combat.
- The importer's deactivation (`isActive = false`) must not break combats or encounter lineups: lineups display a "no longer in active library" warning but still resolve from the stored hash/snapshot.
- Zod validation for every input; JSON columns (`overrides`, `statSnapshot`, `conditions`, `payload`) are parsed by versioned zod schemas on read and write (`schemaVersion` field), and unreadable rows degrade to a safe error state rather than throwing the page.
- Bounds: quantity 1–50 per entry; combatants ≤ 200 per combat; initiative −20..60; HP 0..999999; notes/labels length-capped like existing models.

### Concurrency

- Optimistic concurrency via `Combat.version`: each command carries `expectedVersion`; the update is `updateMany where id AND version = expected`; zero rows → conflict response and client refresh.
- Idempotency keys on commands to dedupe double clicks/retries (`@@unique([combatId, idempotencyKey])`).
- Event `seq` allocated inside the transaction from `Combat.eventSeq` (locked by the versioned update), enforcing a gapless unique sequence.
- Two browser tabs: both can read; writes conflict-check; the second gets a refresh prompt rather than silently overwriting.
- Encounter transitions reuse the existing guarded `updateMany` pattern; starting a combat transitions `planned→active` and creates the `Combat` in one transaction (and `end` does `active→resolved`).

### Authorization

- **The app currently has no authentication or authorization at all.** For a self-hosted single-DM deployment bound to localhost this is acceptable, but combat adds high-frequency writes and (later) a player-facing view.
- Plan: introduce a minimal gate before any player-facing or network-exposed use: a single shared-secret/session guard via Next.js request interception (to be designed against this version's docs in `node_modules/next/dist/docs/` before writing), applied to all server actions and routes. Role split: `dm` (full) vs `viewer` (filtered projection).
- Until that exists: keep hidden-combatant filtering server-side in the projection function, do not add a player view, and document in the README that the app must stay bound to a trusted network.
- Every service function takes the campaign scope and verifies `combat.campaignId` matches the encounter/campaign and that the campaign is not soft-deleted (same `alive` filter pattern as encounters).

### Safety for the database work

- Migrations are **additive SQL only**; reviewed by reading the generated SQL before applying; no `migrate reset`, no `db push --force-reset`, no `DROP`.
- Dev migrations run only against the project's own `dmtool-postgres` database; a pre-flight check confirms `DATABASE_URL` host/port/database name match the expected project values and refuses to run if it matches the Alchemy Table database.
- Never touch the `alchemy-postgres` container or its database.
- Automated tests mock the db (existing pattern) and do not require a live database; any integration tests use a separate throwaway database name created explicitly in a disposable container, never the working database.
- Take a `pg_dump` of the working database before applying each migration (manual step documented in the phase checklist).
- Existing `Campaign`, `Npc`, `PlayerCharacter`, `Encounter`, `Session`, and homebrew `RuleEntry` rows are never rewritten by migrations; new columns are nullable or defaulted.

## 7. Phased implementation

Each phase ends with `npm run check` and `npm run build` green and is independently shippable.

### Phase 1 — Pure combat engine (no DB, no UI change)

- Replace index-based state with id-based state; add `tempHp`, defeated flag, hidden flag, tie-break ordering, wave.
- New pure modules: `dice.ts` (parser + injected RNG), `hp.ts` (damage/heal/temp), `turn.ts`, `events.ts` (event types + inverse computation), `conditions.ts`.
- Keep `parseBulkName`/`numberedNames`/`parseHpDelta`; retire `applyHpDelta` once callers move (the old tracker keeps working until Phase 4).
- **Tests**: dice parsing/limits/determinism with seeded RNG; damage through temp HP; overkill; heal cap; tie-break stability; turn skipping defeated/removed; removal of the active combatant; round wrap; undo inverse for each event type; property-style test "apply then undo returns identical state".

### Phase 2 — Schema and creature resolution

- Additive migration: enums, `EncounterEntry`, `Combat`, `Combatant`, `CombatEvent`, `Npc`/`PlayerCharacter` nullable columns, partial unique index. Generate and **review** SQL before applying; back up first.
- zod schemas with `schemaVersion` for JSON columns; `creature-templates.ts` resolver reusing the monster parser.
- Minimal PC and NPC stat editing service (no heavy UI yet).
- **Tests**: schema validators (accept/reject/bounds); resolver for imported monster, homebrew monster, NPC with and without stat basis, PC, custom; resolver with inactive rule entry; mocked-db tests proving no writes to `RuleEntry`; a test asserting migrations contain no `DROP`/`TRUNCATE`/`DELETE` statements.

### Phase 3 — Encounter lineup editor

- Lineup panel on `/encounters/[id]` (library search, NPC/PC picker, custom, quantity, hidden, wave, overrides); read-only when not `planned`.
- Service: `addEntry/updateEntry/removeEntry/reorder` with the encounter `alive` guard and planned-only rule.
- **Tests**: add/update/remove; quantity bounds; refuses edits when active/resolved; refuses entries from other campaigns' NPCs/PCs; soft-deleted campaign; XP summary from verified `xp`; UI states.

### Phase 4 — Live combat core

- `startCombat` (snapshot copy, numbering, HP mode, transitions encounter to `active`), versioned commands for initiative, turn, HP, add/remove combatant, end combat (`active→resolved`).
- `/combat` hub and `/combat/[id]` console with order list, active stat block, HP controls, autosave status, conflict handling. Retire `localStorage` combat state (with the optional one-time import).
- **Tests**: start snapshot isolation (changing/deactivating the source rule entry later changes nothing); duplicate start blocked by the partial unique index/guard; version conflict; idempotent retry; transactional rollback leaves no partial event; campaign/encounter mismatch rejected; end transitions encounter; resume rebuilds identical state.

### Phase 5 — Conditions, effects, dice and attacks

- Condition picker from library entries with text display; reminders; confirm Exhaustion text before adding levels.
- Dice roller UI; attack-assist flow; damage-type hint from resistance strings; roll events.
- **Tests**: condition add/remove/dedupe; immunity warning; reminder due at the right turn/round; attack flow produces `attack_roll` + `damage` events atomically; manual-result path; resistance hint never mutates the number; missing library data degrades gracefully.

### Phase 6 — Log, undo, recovery, hidden and reinforcements

- Log page with filters and JSON export; undo with conflict detection; hidden/reveal; reserve waves and ad hoc reinforcements; crash-recovery banner.
- **Tests**: undo each event type; undo refused on drift and forced path; undone events remain visible; hidden filtered from the server projection (not just UI); reveal logged; wave instantiation numbering and initiative prompts; recovery after simulated reload.

### Phase 7 — Hardening and authorization gate

- Minimal auth guard (design against this Next.js version's docs), viewer projection (only if wanted), limits/rate guards, README/ops docs, accessibility pass, browser smoke tests of the full flow.
- **Tests**: unauthenticated rejected on all actions; projection leak tests; load test with 200 combatants; keyboard-only flow check.

## 8. Edge cases to handle

- Active combatant removed, defeated, or hidden mid-turn; first combatant removed in round 1; empty order; all combatants defeated (prompt, do not auto-end).
- Combatant added mid-round with higher initiative than the active one (does not steal the turn; appears before the pointer for next round).
- Initiative ties, negative initiative, missing initiative on start.
- Damage > HP + temp HP; negative healing/damage input; heal on a defeated combatant (reactivate prompt); HP edited above max (explicit max-HP change only).
- Source library entry deactivated or re-imported with changed content after combat start; homebrew creature deleted while in an encounter.
- Two tabs/devices acting simultaneously; duplicate submit; network drop between request and response.
- Combat started for a campaign later soft-deleted; encounter soft-deleted with live combat.
- Large quantities (e.g. 40 goblins): numbering, performance, bulk operations (apply to selected).
- Monsters with missing/unparseable fields (HP, AC, actions): fall back to manual entry and flag it; `armor_class` arrays with multiple values; fractional CR; legendary actions (usage reminders only; no automation).
- Concentration: tracked as a tag with a prompt to check on damage; no automatic save resolution without verified rule text.
- Undo across a round boundary; undo after a combatant was removed.
- Exported log/JSON containing hidden-combatant info flagged as DM-only.

## 9. Test strategy

- **Unit (Vitest, mocked db, existing pattern)**: all pure modules with deterministic RNG; all services with a fake `db` capturing `where`/`data` to prove guards (version, alive, planned-only, campaign scope).
- **Contract tests**: zod schemas for each JSON column and each command input (valid, boundary, malicious payloads such as oversized strings/arrays, prototype keys).
- **Invariant tests**: random command sequences preserving `0 ≤ hp ≤ max`, a valid active pointer, gapless `seq`, and `apply→undo` identity.
- **Migration safety tests**: scan generated SQL for destructive statements; verify new columns are nullable/defaulted.
- **Source-fidelity tests**: fixtures built from real imported monster/condition shapes (stored as trimmed fixtures, not live network calls).
- **Integration (optional, disposable DB only)**: transaction atomicity, partial unique index, concurrent version-conflict behavior.
- **Manual/browser smoke**: plan → start → initiative → damage/heal → conditions → undo → reload recovery → end, desktop and tablet widths.
- No test may call the live rules API or write to the working database.

## 10. Out of scope

Virtual tabletop, map grid, tokens, movement, line of sight, automated rules enforcement without verified source text, encounter difficulty budgeting, automatic death-save or condition mechanics, player accounts beyond the minimal gate in Phase 7.

## 11. Assumptions and open questions

Assumptions:

1. Single-DM, self-hosted use; the DM is the only writer.
2. Monster stat sources are the imported 2024 library and homebrew `RuleEntry` rows; Wizards' SRD 5.2.1 parity stays unverified.
3. Initiative modifier is derived from DEX only as a convenience, because the data has no initiative field.
4. Players' combatants use `PlayerCharacter` with manually maintained HP/AC.

Open questions for the owner:

1. Should a read-only **player view** be in scope for the first release? (It drives how early the authorization gate is needed.)
2. Should NPCs be allowed to link to a monster stat basis (additive column on `Npc`), or stay manual-stat only?
3. Preferred default HP mode for monsters: average (`hit_points`), rolled (`hit_points_roll`), or ask each time?
4. Should the legacy `localStorage` combat import be offered, or simply discarded?

## 12. Blockers and risks

- **No blockers** to Phase 1. Phase 2 needs the database to be backed up and the target confirmed before migrating.
- **Authorization is absent**; it must be addressed before any player-facing or network-exposed use.
- The Node version in this environment (20.19.5) does not match the declared `>=22 <23`; checks pass today, but CI/dev should use the `.nvmrc` version.
- Next.js in this repo is a newer version with breaking changes (see `AGENTS.md`); read the relevant guide in `node_modules/next/dist/docs/` before writing route/request-interception code.
- Conditions and initiative lack machine-readable mechanics in the verified source; tracker features must remain DM-confirmed, never silently enforced.

## 13. Phase 2 status (implemented: schema and service layer, no UI)

Migration `20261020120000_combat_data_model` is additive only (new enums and tables, plus one defaulted column `PlayerCharacter.initiativeModifier`). Services live in `src/server/services/combat/` (`creature-templates`, `encounter-entries`, `live-combat`, `engine`, `dice`); validation in `src/lib/validation/combat.ts`.

Deviations from the plan above:

- Conditions and ongoing effects are a `CombatEffect` table, not JSON on the combatant.
- Monster resolution reuses `getMonsterDetail`, which returns active imported monsters only. Homebrew monsters are unsupported until a creation path exists.
- No column was added to `Npc`; an NPC entry takes stats from a linked library monster (`ruleEntryId`) or from explicit overrides.
- Encounter lineups are editable only while the encounter is `planned`.
- Undo is event-based with drift checks; there is no redo, and `combat_created` / `combat_ended` are not undoable.
- Conditions are not auto-enforced and defeat is not automatic at 0 HP; due effects are reported by `advanceTurn`.

Applying the migration (working database): back up first with `pg_dump` from the `dmtool-postgres` container, then `npm run db:sync`. Never run against `alchemy-postgres`.

Integration tests are skipped unless `COMBAT_TEST_DATABASE_URL` points at a database whose name contains `scratch` or `test`.
