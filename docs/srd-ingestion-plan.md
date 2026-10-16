# 2024 SRD Rules Library: Ingestion Plan

**Status:** discovery and design only; no schema or importer is implemented yet.  
**Reviewed:** 2026-10-16

## Goals and repository fit

Build a local, searchable reference library from the D&D System Reference Document 5.2 (2024 rules), with clear source attribution and a strict boundary between imported rules and user-authored homebrew. This phase is intended to inform the later schema, importer, and UI work; it does not authorize importing other Open5e documents or 2014 SRD material by default.

The current project is a Next.js App Router application using TypeScript, PostgreSQL, Prisma, Zod, and Vitest. `src/server/services/` owns business logic, `src/lib/validation/` owns Zod validation, and tests sit beside their modules. The Prisma schema currently contains campaign-oriented models only. The app shell navigation is in `src/components/layout/app-shell.tsx`; the library should fit the existing route and service conventions rather than introduce a separate application architecture.

## Verified source API and category coverage

The planned source is Open5e API v2:

- Base URL: `https://api.open5e.com/v2/`
- The 2024 document key is `srd-2024`; constrain requests to that document with `document__key=srd-2024`.
- API v2 exposes paginated JSON collection endpoints. Follow each response's pagination links/metadata rather than assuming one page or a fixed catalog size.
- The upstream v2 URL registrations and the `srd-2024` fixture directory confirm the endpoint names and that this document has structured data for the categories below. The endpoint list is broader than the contents of this one SRD document; a registered endpoint does **not** guarantee an SRD 5.2 result for it.
- Verification was against Open5e's upstream v2 route registrations and its `srd-2024` data fixtures, not a live API response. Before implementing the importer, confirm the live API's response envelope, filters, pagination, and category counts against the current service.

### User-facing library categories

| Library category               | API endpoint                                                                                                                              | SRD 5.2 coverage and modeling notes                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creatures / monsters           | `/creatures/`                                                                                                                             | Includes creature stat blocks, actions, attacks, traits, and creature-type references.                                                                                                                    |
| Spells                         | `/spells/`                                                                                                                                | Spell details can contain structured casting options.                                                                                                                                                     |
| Weapons                        | `/weapons/`                                                                                                                               | Weapon-specific data and weapon property assignments.                                                                                                                                                     |
| Armor                          | `/armor/`                                                                                                                                 | Armor-specific data.                                                                                                                                                                                      |
| Equipment and adventuring gear | `/items/`                                                                                                                                 | General items; present separately from weapons, armor, and magic items in the API. Avoid duplicate presentation when records are represented by more than one endpoint.                                   |
| Magic items                    | `/magicitems/`                                                                                                                            | Separate endpoint; coverage should be measured from filtered live results.                                                                                                                                |
| Classes and subclasses         | `/classes/`                                                                                                                               | Classes and subclasses share this endpoint; subclasses are identified through their parent class relation, not a separate endpoint. Class features and feature items are represented in SRD fixture data. |
| Species                        | `/species/`                                                                                                                               | Species and species traits.                                                                                                                                                                               |
| Backgrounds                    | `/backgrounds/`                                                                                                                           | Background benefits are represented in SRD fixture data.                                                                                                                                                  |
| Feats                          | `/feats/`                                                                                                                                 | Feat benefits are represented in SRD fixture data.                                                                                                                                                        |
| Rules                          | `/rules/`, `/rulesets/`                                                                                                                   | Rule entries and rule-set groupings; inspect the actual SRD records before deciding how to render groupings.                                                                                              |
| Conditions                     | `/conditions/`                                                                                                                            | Core concept with document-specific descriptions.                                                                                                                                                         |
| Abilities                      | `/abilities/`                                                                                                                             | Ability names are core concepts; the SRD contributes document-specific descriptions.                                                                                                                      |
| Skills                         | `/skills/`                                                                                                                                | Skill names are core concepts; the SRD contributes document-specific descriptions.                                                                                                                        |
| Damage types                   | `/damagetypes/`                                                                                                                           | Core concepts with document-specific descriptions.                                                                                                                                                        |
| Supporting reference data      | `/alignments/`, `/creaturetypes/`, `/languages/`, `/sizes/`, `/spellschools/`, `/weaponproperties/`, `/itemcategories/`, `/itemrarities/` | Useful for labels, filters, and linked details. Do not assume each is a standalone browse page.                                                                                                           |
| Services                       | `/services/`                                                                                                                              | A distinct endpoint and SRD fixture category; confirm how it fits the product before exposing it as a prominent library page.                                                                             |

Other registered v2 endpoints include `/documents/`, `/licenses/`, `/publishers/`, `/gamesystems/`, `/creaturesets/`, `/itemsets/`, `/environments/`, `/images/`, and `/enums/`. These provide source metadata, supporting taxonomies, or broader API data; they are not all standalone SRD library categories. Open5e's 2024 fixtures also include cross-references and nested records (for example, creature actions, class features, species traits, feat benefits, and background benefits). Some such models have no independent collection endpoint and should be read from their parent payload or resolved relations.

**Coverage caveats:** Classes/subclasses, class features, ability/skill/damage-type descriptions, and benefits are not all independent API collections. The v2 model treats subclasses as character classes with a parent, and its shared concepts use per-document descriptions. The product must not claim a standalone category is fully supported until live filtered results and payload shape have been checked. If a requested category has no 2024 SRD records or no suitable endpoint, show that limitation explicitly instead of silently substituting 2014 or third-party content.

### API references

- [Open5e API v2](https://api.open5e.com/v2/)
- [Open5e v2 route registrations](https://github.com/open5e/open5e-api/blob/staging/api_v2/urls.py)
- [Open5e SRD 5.2 fixtures](https://github.com/open5e/open5e-api/tree/staging/data/v2/wizards-of-the-coast/srd-2024)
- [Open5e v2 shared concepts](https://github.com/open5e/open5e-api/blob/staging/docs/v2/shared-concepts.md)
- [Official SRD 5.2.1 reference](https://www.dndbeyond.com/srd)
- [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

## Proposed database structure

Keep source records generic enough to preserve the upstream payload while promoting only common query and ownership fields to columns. Use PostgreSQL `Json` for raw payloads (Prisma maps this to `jsonb` on PostgreSQL). Do not make every upstream field a required column: source payloads and endpoint shapes evolve.

### `RuleSource`

One row per imported source document, initially Open5e's `srd-2024`.

- Identity: `provider`, `documentKey`, and a unique constraint on `(provider, documentKey)`.
- Attribution: source title, source URL, publisher, license name/URL, and the required attribution statement.
- Import metadata: latest successful fetch time, API/base URL, and optional upstream version/ETag if supplied.
- Keep source attribution independent of an individual rule so it can be displayed consistently and updated without rewriting every entry.

### `RuleEntry`

One row per rule-library record, whether imported or homebrew.

- Query/display fields: `id`, `category`, `name`, optional normalized search text, and timestamps.
- Imported identity: nullable `sourceId` relation, `sourceKey` (the upstream stable key), and a unique constraint on `(sourceId, category, sourceKey)`.
- Ownership: explicit `origin` (`IMPORTED` or `HOMEBREW`). Imported rows must identify a source; homebrew rows must not be eligible for importer updates.
- Content: `rawData` JSON retaining the source payload, plus a `contentHash` of canonicalized content.
- Lifecycle: `isActive`/removal metadata and last-seen import/run reference so a completed sync can flag disappeared upstream records without hard deletion.
- Index category, normalized name, source identity, and active state for list/search screens. Add PostgreSQL full-text or trigram indexing only after the initial query needs and existing deployment support are confirmed.

Use a string category checked by application validation (rather than a Prisma enum) so upstream categories can be added without a destructive schema migration. For the first release, retain nested records in the parent JSON unless independent searching, relations, or editing requires normalization.

### `RuleImportRun`

An audit/report row for preview, import, and synchronization runs.

- Capture source, start/end timestamps, mode, status, and whether writes were enabled.
- Store counts for discovered, valid, invalid, created, updated, unchanged, skipped, and deactivated records.
- Store structured validation/API errors and a concise summary; do not store credentials or unbounded response bodies here.
- A preview is a run with writes disabled. Only a fully completed synchronization can update missing-record lifecycle state.

These are proposed logical models, not final Prisma field definitions. Before migration, decide whether source-level license and run error details should be normalized further, and whether records need normalized child tables for search.

## Import and synchronization safeguards

1. Fetch only allowlisted v2 endpoints and require the exact `srd-2024` document filter. Validate the response envelope, pagination, source key, category, and minimum required display fields with Zod.
2. Preview without writes: report category counts, invalid records, duplicate identities, hash changes, and potential create/update/deactivate actions.
3. Canonicalize JSON deterministically before hashing; exclude transient transport fields. Identical hashes are unchanged, and changed hashes update only importer-owned rows with the same source identity.
4. Never match or update by display name alone. Enforce the imported composite identity in the database and keep the origin discriminator out of any upsert path that could select a homebrew row.
5. Make retries idempotent. A repeated import of unchanged data creates no duplicates and reports unchanged rows. Apply writes transactionally where practical; record item-level errors and make incomplete runs visible.
6. Do not hard-delete on upstream absence. Mark records inactive only after every required page for a complete successful source/category sync has been consumed. A preview, failed run, or partial page walk must not deactivate anything.
7. Preserve the original response in `rawData`, and keep user-created content in its own origin lane. Importer updates and sync cleanup must never alter, claim, or delete homebrew records.
8. Display attribution from `RuleSource` on detail pages and in the library's source/help view. Include the SRD 5.2 CC-BY-4.0 attribution statement and do not imply Wizards of the Coast endorsement.

## Delivery sequence

1. **API verification and schema (this plan, then phase 2):** probe live endpoints, document actual fields/counts/filters and unsupported categories, add Prisma models and a safe additive migration, and test identity constraints, JSON persistence, source attribution, and the imported/homebrew ownership boundary. Do not bulk import in this phase.
2. **Importer (phase 3):** implement API client, page traversal, validation, preview/reporting, stable hashes, safe upserts, repeat-import tests, and complete-run synchronization behavior.
3. **Library shell (phase 4):** add navigation, overview/search/category counts, and import administration with loading, empty, error, preview, and last-run states.
4. **Category experiences (phases 5–7):** build creature browsing and details first, then spells/equipment/magic items, followed by rules, conditions, character options, and shared references. Mark unsupported coverage honestly.

## Acceptance criteria for the next phase

- The selected API source and exact 2024 document filter are verified against live responses, with observed pagination and per-category counts recorded.
- Migration is additive and can be applied using the repository's existing Prisma migration workflow.
- Imported identity is stable and unique; homebrew is structurally distinguishable and excluded from update/deactivate operations.
- Raw JSON, source attribution, and content hashes persist and are queryable.
- Tests prove a repeated unchanged import creates no duplicate, changed source content updates only its imported record, and no importer path overwrites or deletes homebrew.
