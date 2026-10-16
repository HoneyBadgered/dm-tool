# SRD Rules Library: Ingestion Plan (Phase 1)

Status: planning only. No implementation in this phase.

## 1. Codebase inspection

- Next.js 16 (App Router, Cache Components), React 19, TypeScript, Zod 4, Vitest.
- Prisma 7 with PostgreSQL via `@prisma/adapter-pg`; client generated to `src/generated/prisma`; accessed through `getDb()` in `src/lib/db/client.ts`.
- Existing models: `Campaign`, `PlayerCharacter`, `Session`, `Npc`, `Encounter` (cuid ids, `createdAt`/`updatedAt`, soft delete via `deletedAt`). Migrations live in `prisma/migrations` (timestamped folders).
- Conventions: Zod validation in `src/lib/validation/*`, domain logic in `src/lib/<domain>/*` with colocated `*.test.ts`, server actions in `src/app/<route>/actions.ts`, request-time Prisma reads deferred with `io()` inside Suspense.
- Checks: `npm run check` (lint, typecheck, test, format:check).
- Nothing exists yet for rules content, source attribution, or imports.

## 2. API verification

Target: the 2024 SRD endpoints of the D&D 5e API (`https://www.dnd5eapi.co/api/2024`).

**Verification status: NOT directly verified.** The build sandbox cannot resolve `www.dnd5eapi.co` (DNS blocked for curl and web fetch), so no live responses were inspected. The category list below comes from a web-search summary citing the API root and must be confirmed by running the verification steps in section 6 from a networked machine before Phase 2 finalises its schema. Field shapes are assumptions until then.

### Reported categories (unconfirmed)

| Category                                                                               | Library use                                   |
| -------------------------------------------------------------------------------------- | --------------------------------------------- |
| monsters                                                                               | Monster library (Phase 5)                     |
| spells, magic-schools                                                                  | Spells (Phase 6)                              |
| equipment, equipment-categories, weapon-properties, weapon-mastery-properties          | Weapons, armor, gear (Phase 6)                |
| magic-items                                                                            | Magic items (Phase 6)                         |
| conditions, damage-types, ability-scores, skills, proficiencies, languages, alignments | Rules reference (Phase 7)                     |
| classes, subclasses, species, subspecies, backgrounds, feats, features, traits         | Character options (Phase 7)                   |
| poisons                                                                                | Equipment / rules; decide during verification |

Categories in the problem statement not seen in the reported list should be marked "unsupported by source" in the UI rather than faked. Rules sections (e.g. combat text) were not in the reported list.

### Expected API shape (to confirm)

- Root returns `{ category: "/api/2024/category" }`.
- Category index returns `{ count, results: [{ index, name, url }] }` (assumed no pagination).
- Detail at `/api/2024/<category>/<index>` returns full JSON, expected to include `index`, `name`, `url`, and for some entities `updated_at`.
- Licensing/attribution: SRD 5.2 content is CC-BY-4.0; each record must carry attribution.

## 3. Proposed database structure (Phase 2)

All library tables are separate from campaign tables, so homebrew and imports never collide.

- `RulesSource`: `id`, `slug` (unique, e.g. `srd-2024`), `name`, `license`, `attribution`, `baseUrl`, `edition`, `createdAt`.
- `RulesEntry` (one polymorphic table, with typed per-category extract columns added later if filters need them):
  - `id`, `sourceId` (FK), `category` (enum or validated string), `externalIndex`, `name`, `apiUrl`
  - `data` (`Json`, raw API payload), `contentHash` (sha256 of canonical JSON), `searchText`
  - queryable extracts, nullable: `monsterCr`, `monsterType`, `spellLevel`, `spellSchool`, `itemRarity`, `equipmentCategory`
  - `firstImportedAt`, `lastSeenAt`, `lastChangedAt`, `removedUpstreamAt`
  - `@@unique([sourceId, category, externalIndex])`, indexes on `(category, name)` and a trigram or full-text index on `searchText`.
- `ImportRun`: `id`, `sourceId`, `mode` (preview/apply), `status`, `startedAt`, `finishedAt`, counts (created/updated/unchanged/removed/failed), `report` (`Json`).
- `ImportError`: `runId`, `category`, `externalIndex`, `message`, `payload`.
- Homebrew: a distinct `HomebrewEntry` table (campaign-scoped, optional `basedOnEntryId` referencing `RulesEntry`). Importers only write to `RulesEntry`, so they cannot overwrite homebrew.

Migrations must be additive only (new tables and enums), safe to run on existing data.

## 4. Import strategy (Phase 3)

1. Fetch the category index, then each detail with bounded concurrency, retries with backoff, and a User-Agent.
2. Validate each payload with a per-category Zod schema (loose: require `index`, `name`, `url`; keep the rest in raw JSON).
3. Canonicalise (sorted keys) then hash; upsert by `(source, category, index)`. Unchanged hash means touch `lastSeenAt` only.
4. Records absent upstream are flagged `removedUpstreamAt`, never hard-deleted.
5. Preview mode computes the diff with no writes. Apply mode runs per-category transactions. Per-record failures are recorded in `ImportError` and do not abort the run.
6. Entry points: `npm run srd:preview` and `npm run srd:import` (with `--category`).
7. Tests with mocked fetch: repeat import creates no duplicates, change detection works, homebrew rows are untouched, and failures are reported.

## 5. UI phases

Phases 4-7 follow the problem statement: Rules Library nav and import admin, then monsters, then spells/equipment/magic items, then conditions, rules, and character options. Each page needs loading, empty, and error states, and source labels on every record. The "Add to Encounter" action is reserved for later.

## 6. Verification steps still required

From a networked machine:

```sh
curl -s https://www.dnd5eapi.co/api/2024 | jq
for c in $(curl -s https://www.dnd5eapi.co/api/2024 | jq -r 'keys[]'); do
  curl -s "https://www.dnd5eapi.co/api/2024/$c" | jq '{c: "'$c'", count}'
done
curl -s https://www.dnd5eapi.co/api/2024/monsters | jq '.results[0]'
```

Record per-category counts, a sample payload, field names for the extract columns, whether `updated_at` exists, rate limits, and the license text. Update this document with the findings.

## 7. Risks

- Unverified endpoint shapes (above).
- Upstream changes or removals: handled by the hash and `removedUpstreamAt`.
- Large monster payloads: stored as JSON and indexed through extracts only.
- Availability of the public API: support a local cached JSON snapshot as an import source.
