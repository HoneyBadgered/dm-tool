# D&D Rules Library: Discovery and Ingestion Plan

**Status:** all planned library phases have a working first pass. All 24 verified API collections were imported on 2026-10-16 (1,726 records created, no errors). Category-specific refinements and encounter integration remain future work.
**Reviewed:** 2026-10-16

## Goals and repository fit

Build a searchable reference library from the 2024 D&D SRD API, with source attribution and a strict boundary between imported rules and homebrew. The work is staged: verify the source, add storage, build a safe importer, then deliver the library UI and category experiences. A full preview first validated all 1,726 records across 24 collections with no errors. The subsequent confirmed import created all 1,726 records, with no updates, skipped records, deactivations, or errors. Import run ID: `cmvbjbysq0001778o571g9go5`.

The project is a Next.js App Router application using TypeScript, PostgreSQL, Prisma, Zod, and Vitest. Business logic belongs in `src/server/services/`, Zod schemas in `src/lib/validation/`, and tests beside their modules. Prisma currently models campaign data; the app shell navigation is in `src/components/layout/app-shell.tsx`. The rules library should follow these conventions.

## Verified API

The selected API is the D&D 5e API's versioned 2024 REST API:

- Base URL: `https://www.dnd5eapi.co/api/2024`
- Its 2024 API documentation identifies the ruleset as SRD 5.2.
- The API is public, requires no authentication, and permits GET requests only.
- The root endpoint returns the available collection routes.
- Live collection endpoints return a JSON envelope with `count` and `results`. On 2026-10-16, all 24 routes listed by the root were checked: for each, the observed `count` equaled `results.length`, and the envelope had no pagination fields. The importer should validate that completeness condition and fail visibly if the API shape changes rather than silently treating a partial response as complete.
- Collection records link to detail resources using relative `url` values; detail payloads include richer structured data. For example, monster details contain stat blocks and nested actions, and equipment details contain costs, damage, equipment-category links, weapon properties, and mastery properties.
- The live `/proficiencies` collection has a known URL inconsistency: 16 tool proficiency summaries use `/proficiencies/tool-<index>` links, but those linked URLs return 404 while `/proficiencies/<index>` returns the detail record. The importer allows only this exact same-origin alias pattern and fetches the canonical index route; any other route mismatch is rejected.
- There is no document query parameter: the edition is selected by the `/2024` base path. Do not add Open5e's `document__key` filter or assume an Open5e response shape.
- A live `/rules` request returns 404. There are also no `/weapons`, `/armor`, or `/abilities` collection routes; use the supported routes and mappings below instead.

The API docs call this the 2024/SRD 5.2 ruleset. Wizards' SRD page currently lists SRD 5.2.1 as its latest 5.2 release. The API's edition path alone does not establish that its data matches every 5.2.1 erratum. Treat upstream revision as unconfirmed; record the API edition and retrieval timestamp, and compare/pin a specific official SRD revision before claiming 5.2.1 parity.

### Live categories and counts

Counts are a point-in-time snapshot from the live root and category endpoints, not permanent guarantees. The listed counts matched the number of returned collection results at review time.

| API collection               | Count | Intended library use                                                      |
| ---------------------------- | ----: | ------------------------------------------------------------------------- |
| `/monsters`                  |   341 | Creatures / monsters                                                      |
| `/spells`                    |   339 | Spells                                                                    |
| `/equipment`                 |   182 | Weapons, armor, adventuring gear, and other equipment                     |
| `/equipment-categories`      |    30 | Equipment facets and grouping, not separate copies of equipment           |
| `/magic-items`               |   262 | Magic items                                                               |
| `/classes`                   |    12 | Classes                                                                   |
| `/subclasses`                |    12 | Subclasses                                                                |
| `/features`                  |   232 | Features                                                                  |
| `/species`                   |     9 | Species                                                                   |
| `/subspecies`                |    24 | Supporting species data; inspect relationships before exposing separately |
| `/backgrounds`               |     4 | Backgrounds                                                               |
| `/feats`                     |    17 | Feats                                                                     |
| `/conditions`                |    15 | Conditions                                                                |
| `/ability-scores`            |     6 | Ability scores (the API uses this route, not `/abilities`)                |
| `/skills`                    |    18 | Skills                                                                    |
| `/damage-types`              |    13 | Damage types                                                              |
| `/traits`                    |    67 | Supporting traits / features; inspect overlap before a standalone page    |
| `/proficiencies`             |    74 | Supporting proficiencies and filters                                      |
| `/alignments`                |    10 | Supporting reference data                                                 |
| `/languages`                 |    19 | Supporting reference data                                                 |
| `/poisons`                   |    14 | Poisons; optional library category                                        |
| `/weapon-properties`         |    10 | Supporting weapon-property data                                           |
| `/weapon-mastery-properties` |     8 | Supporting weapon-mastery data                                            |
| `/magic-schools`             |     8 | Supporting spell-school data                                              |

The root also confirms exactly these 24 collection names: `ability-scores`, `alignments`, `backgrounds`, `classes`, `conditions`, `damage-types`, `equipment`, `equipment-categories`, `feats`, `features`, `languages`, `magic-items`, `magic-schools`, `monsters`, `poisons`, `proficiencies`, `skills`, `species`, `spells`, `subclasses`, `subspecies`, `traits`, `weapon-mastery-properties`, and `weapon-properties`.

### Coverage limits and presentation

- Weapons, armor, and adventuring gear are represented through `/equipment` and categorized using each equipment record's `equipment_categories` links. Build those as UI views/filters over equipment, not as unsupported independent endpoints.
- `/rules` is not available. Do not claim the API supplies a complete standalone rules compendium. Rules concepts present in other records do not establish full rules coverage.
- Ability entries are available from `/ability-scores`; there is no `/abilities` route.
- Classes, subclasses, and features each have their own collection. Preserve their upstream identities and relationships rather than flattening them into class text.
- The route inventory and counts prove collection availability, not completeness or UI suitability of every detail field. Inspect detail payloads and cross-references during phase 2/3; identify unsupported or empty categories honestly.
- Do not mix in 2014 API results, Open5e documents, or third-party/homebrew data as fallback content.

### Attribution and source boundaries

The API is a third-party service. Label the upstream source honestly and do not imply it is operated or endorsed by Wizards of the Coast. Wizards publishes SRD 5.2 under CC BY 4.0 and gives the following attribution for reuse:

> This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Keep this attribution available in the library's source/help view and alongside imported content as appropriate. Do not add other attribution to Wizards or imply endorsement. Confirm whether the 2024 API's exact underlying SRD revision is 5.2 or 5.2.1 before representing the imported snapshot as the latter.

### API references

- [2024 API introduction and authentication/HTTP behavior](https://docs.dnd5eapi.co/2024/introduction)
- [2024 API root / live route inventory](https://www.dnd5eapi.co/api/2024/)
- [2024 monster collection](https://www.dnd5eapi.co/api/2024/monsters)
- [2024 spell collection](https://www.dnd5eapi.co/api/2024/spells)
- [2024 equipment detail example](https://www.dnd5eapi.co/api/2024/equipment/battleaxe)
- [Wizards' System Reference Document page](https://www.dndbeyond.com/srd)
- [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

## Proposed database structure

Use generic source-owned records to preserve upstream payloads while promoting only fields needed for identity, filtering, search, and ownership. PostgreSQL `Json` stores raw payloads as `jsonb`. Do not make every upstream property a required column.

The initial Prisma schema and additive migration define `RuleSource`, `RuleEntry`, and `RuleImportRun`. The source stores the API edition and a nullable `verifiedSrdRevision`; null means no official-revision parity claim. Imported equipment is stored under the single `equipment` collection category and uses its raw `equipment_categories` for UI facets. A database check constraint requires source identity and a content hash for imported rows and prevents homebrew rows from carrying imported source identity.

### `RuleSource`

One row per upstream source/edition, initially the 2024 API.

- Identity: provider (`dnd5eapi.co`), API edition (`2024`), and unique provider/edition key.
- Attribution: human-readable source label, API and official SRD URLs, license name/URL, and required SRD attribution statement.
- Import metadata: last successful synchronization time, API base URL, observed upstream revision if established, and optional response metadata.

### `RuleEntry`

One row per library record, whether imported or homebrew.

- Display/search: stable ID, category, name, optional normalized search text, timestamps, and active state.
- Imported identity: nullable source relation, upstream collection/category, and upstream `index`; enforce uniqueness for `(sourceId, category, sourceKey)`.
- Ownership: explicit origin (`IMPORTED` or `HOMEBREW`). Imported entries require a source and stable source key; homebrew entries have no source identity. Enforce this invariant in the database where feasible as well as application validation.
- Content: `rawData` JSON retaining the full upstream detail payload, plus a deterministic content hash.
- Synchronization: last-seen import/run reference and inactive/removal metadata; never hard-delete a record just because it disappeared upstream.
- Index category, normalized name, source identity, and active state for library queries. Add specialized text indexes only when query needs and deployment support are established.

Keep nested source records in `rawData` initially. Normalize them only if independent search, relationships, or editing makes that necessary. Treat equipment category assignments as facets over equipment records, not duplicate imported records.

### `RuleImportRun`

An audit/report row for preview, import, and synchronization.

- Capture source, start/end times, mode, status, and whether writes were enabled.
- Count discovered, valid, invalid, created, updated, unchanged, skipped, and deactivated records.
- Store bounded structured validation/API errors and a concise summary; never store credentials or unbounded response bodies.
- A preview is explicitly read-only. Only a fully completed run may update missing-record lifecycle state.

The migration has been applied locally. Its check constraint enforces the imported/homebrew source-identity boundary, and the importer only updates rows matching imported origin and source identity.

## Import and synchronization safeguards

1. Allowlist only the verified `/api/2024` collection routes. Validate the `count`/`results` envelope, result count, required `index` and `url`, detail payload identity, and category-specific minimum display fields with Zod. Resolve detail URLs only against the trusted API origin.
2. Preview without writes and report discovered counts, invalid records, duplicate identities, hash changes, and proposed create/update/deactivate actions.
3. Fetch detail payloads for complete stored records. Use bounded concurrency and explicit timeouts/retries; surface errors in the run report.
4. Canonicalize JSON deterministically for content hashing, excluding only confirmed transient transport metadata. Preserve the unmodified source detail payload in `rawData`.
5. Upsert only by `(sourceId, category, sourceKey)` and update only imported records. Never match by display name, claim, overwrite, or deactivate homebrew content.
6. Make retries idempotent. Unchanged hashes create no duplicates and are reported unchanged. Apply writes transactionally where practical; keep item-level failures visible and mark incomplete runs accordingly.
7. Do not deactivate records after a preview, failed run, partial detail fetch, or changed/unrecognized response shape. Deactivation is eligible only after complete successful collection and detail processing for the synchronized scope.
8. Display source attribution in the library and on imported content; distinguish imported SRD material from homebrew in storage and UI.

### Import commands

The CLI defaults to a read-only preview. Preview runs are recorded in `RuleImportRun` but do not create or update rule entries. Write operations require an explicit `--confirm`:

```bash
npm run rules:preview -- --collection monsters
npm run rules:import -- --collection monsters --confirm
npm run rules:sync -- --collection monsters --confirm
```

Omit `--collection` to process all 24 verified collections, or repeat `--collection` to choose multiple collections. Review a preview before running an import or sync. A sync only deactivates missing imported records after every listed detail in that collection has validated and processed successfully. Failed/partial collections are reported and left active. Run reports retain bounded item-level errors and aggregate counts; preview does not advance the last successful import timestamp.

## Delivery sequence

1. **Foundation and API verification (this phase):** inspect project conventions, verify live 2024 API routes and response behavior, record category coverage and limitations, and propose storage design. Complete.
2. **Database schema and source tracking:** base models and additive migration are in place; migration/integration tests and any refinements remain.
3. **Import engine:** implemented preview, validation, idempotent imports, change detection, reports, and complete-collection-only synchronization with repeat-import/homebrew-isolation tests. First confirmed import completed for all 24 collections (1,726 records).
4. **Import administration and global search:** the overview includes category counts and imported-record name/source-key search. The read-only import-history screen shows bounded recent run details, errors, and last successful write timestamp. The screen does not start write operations; CLI imports require explicit `--confirm`.
5. **Monster library:** implemented imported-only browsing with name, size, type, and challenge-rating filters; stat-block detail views include ability scores, defenses, senses, proficiencies, traits, actions, and source attribution. Add to Encounter remains a disabled future action.
6. **Spells, equipment, and magic items:** implemented browse/search lists, equipment subcategory/name filters, and shared structured detail pages with expandable original API payloads.
7. **Conditions, rules, and character options:** implemented browse/search and structured details for every verified API collection. Standalone rules coverage remains unsupported and is labeled honestly.

The main navigation destinations are functional: the Dashboard summarizes active data; the World Board groups campaign NPCs by recorded location with search; and the Story Tracker creates, edits, and searches session dates, titles, and recaps. NPC and encounter lists also support filtering.

## Phase 2 acceptance criteria

- The additive Prisma migration applies using the repository's existing migration workflow and leaves campaign data/models intact.
- Imported identity is stable and unique; homebrew is structurally distinguishable and excluded from importer update/deactivation paths.
- Raw JSON, source attribution, source keys, and deterministic content hashes persist and are queryable.
- Tests prove an unchanged repeat import creates no duplicates, changed upstream data updates only its imported record, and import/sync operations never overwrite or delete homebrew.
- Imported source/version metadata does not claim SRD 5.2.1 parity until that revision is verified.

The `/rules` page provides source coverage, imported category counts, browse-all links for every category, a name/source-key search, and links to import history. General category lists are alphabetized and paged 50 records at a time, with an optional name/source-key filter; no search term is required to browse. Records open a shared structured-detail view with source attribution and expandable original API JSON; monsters use their dedicated stat-block page. Equipment is available as a complete filterable list as well as weapons, armor, and adventuring gear facets over the same records. Search and lists include active imported records only and do not include campaign homebrew. `/rules/imports` shows the ten most recent audit runs, error summaries, and the last successful write timestamp. It is intentionally read-only: write operations remain explicit CLI actions requiring `--confirm`. All 24 API collections have now been imported, so supported category views can read the stored data without fetching live API data while browsing.
