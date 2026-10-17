# DM Tool

A minimal, responsive web app that helps a Dungeon Master run a homebrew D&D campaign during live sessions. This phase only provides the project foundation: app shell, placeholder dashboard, database wiring, and tooling.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL · Prisma · Docker Compose · Vitest · ESLint · Prettier

## Development setup

Requirements: Node.js 22 LTS (`>=22 <23`, pinned in `.nvmrc`; run `nvm use`), npm, Docker.

Run in this order:

```bash
nvm use                  # Node 22
cp .env.example .env     # set POSTGRES_PASSWORD and the password in DATABASE_URL
docker compose up -d db  # 1. start PostgreSQL
npm install              # 2. install deps (also runs `prisma generate`)
npm run db:migrate       # 3. create/apply migrations
npm run dev              # 4. http://localhost:3000
```

`prisma.config.ts` loads `.env` itself, so Prisma commands work in a fresh shell without `source .env`.

`.env` is git-ignored; only `.env.example` is committed. Never commit credentials.

After pulling changes that include `prisma/schema.prisma` or `prisma/migrations/`, run:

```bash
npm run db:sync
```

This regenerates the Prisma client and applies checked-in migrations. `npm run dev` also regenerates the client before starting, preventing stale Prisma delegates after a pull; it deliberately does not apply migrations so the dev server can still start without a database.

## Commands

| Command                                                   | Purpose                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                                             | Start dev server                                                       |
| `npm run build`                                           | Production build                                                       |
| `npm run lint`                                            | ESLint                                                                 |
| `npm run typecheck`                                       | TypeScript check                                                       |
| `npm run format`                                          | Format with Prettier                                                   |
| `npm run format:check`                                    | Verify formatting                                                      |
| `npm run check`                                           | lint + typecheck + test + format:check (used by CI)                    |
| `npm test`                                                | Run Vitest unit tests                                                  |
| `npm run db:generate`                                     | Generate Prisma client                                                 |
| `npm run db:migrate`                                      | Create/apply dev migrations                                            |
| `npm run db:sync`                                         | Generate Prisma client and deploy pending migrations                   |
| `npm run rules:preview`                                   | Preview the 2024 API import (all collections by default)               |
| `npm run rules:import -- --collection monsters --confirm` | Import a selected collection after reviewing a preview                 |
| `npm run rules:sync -- --collection monsters --confirm`   | Import and deactivate missing records after a complete collection sync |

`rules:preview` persists an audit run but does not create or update rule entries. Write modes require `--confirm`. Select a collection with `--collection <name>`; repeat the option for several collections. A sync deactivates missing imported records only for fully fetched, validated collections. It never deletes homebrew entries.

The dev server and page rendering do not need the database; only code that calls `getDb()` does.

## Troubleshooting

- **Node mismatch** (`EBADENGINE` or odd build errors): run `nvm use`; Node must be 22.x.
- **Missing env vars / `DATABASE_URL` empty**: ensure `.env` exists (`cp .env.example .env`) and `DATABASE_URL` is set.
- **DB connection refused / port mismatch**: `POSTGRES_PORT` in `.env` must match the port in `DATABASE_URL`; check `docker compose ps` and that nothing else uses the port.
- **Auth failed for user**: the password in `DATABASE_URL` must match `POSTGRES_PASSWORD`. If changed after first start, run `docker compose down -v` (destroys local data).
- **Prisma field/model missing after a pull**: run `npm run db:sync`, then restart `npm run dev`.

## Known dependency warnings

No major upgrades are forced to silence warnings; run `npm audit` for current status. The remaining `npm audit` finding (`braces` via `eslint-config-next` → `fast-glob`/`micromatch`) is dev-only lint tooling; the suggested fix downgrades `eslint-config-next` to 14.x (breaking), so it is accepted until upstream fixes land.

## Architecture

```
src/app/                 Routes and layouts (App Router)
src/components/layout/   App shell and navigation
src/components/ui/       Small reusable UI pieces
src/lib/db/              Prisma client access (single shared instance)
src/lib/validation/      Zod schemas
src/lib/env.ts           Validated environment access
src/server/services/     Business logic (calls db + validation)
src/generated/prisma/    Generated Prisma client (git-ignored)
prisma/                  Schema and migrations
```

Conventions: keep modules small; validate input with Zod; keep DB access out of components; place tests beside code as `*.test.ts`.

## Status

- Done: foundation, Campaign / PlayerCharacter / Session models (initial migration), combat tracker at `/combat`.
- Rules Library foundation: source/revision metadata, imported-vs-homebrew rule records, import-run tracking, and equipment views for weapons, armor, and adventuring gear. The `/rules` shell explains that there is no standalone rules endpoint and does not claim 5.2.1 parity. Run `npm run db:sync` after pulling the migrations.
- Import engine: validated preview/import/sync commands, safe source-identity updates, content hashes, per-run reports, and complete-collection-only deactivation. Imported all 24 verified API collections on 2026-10-16: 1,726 records created, with zero errors, updates, skipped records, or deactivations. Import run: `cmvbjbysq0001778o571g9go5`.
- Rules Library UI: category counts, paginated browse-all lists for every imported category, name/source-key filtering, read-only import history, complete equipment lists and facets, monster stat blocks, and structured detail pages for other imported categories are implemented.
- Campaigns: CRUD at `/campaigns`, `/campaigns/new`, `/campaigns/[id]` (edit via `?edit`, delete is a soft delete). Service in `src/server/services/campaigns`. After pulling database changes, run `npm run db:sync`. These pages need a running database (`docker compose up -d`). No seed script exists.
- The combat tracker's rules are pure functions in `src/server/services/combat`. Its state is currently persisted in browser `localStorage`; moving it to PostgreSQL is a follow-up.
- World Board: campaign-organized NPC directory grouped by location, with search across campaign, person, role, location, and notes.
- Story Tracker: create, edit, and search campaign session records with session number, title, play date, and recap notes.
- Dashboard: campaign/NPC/open-encounter/session/library summaries and direct links to each workspace.
- Not yet built: auth, player portal, dark mode, Playwright tests, app Dockerfile.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every PR.

## Deployment

Self-hosted on Linux: provide a `.env` on the server, run PostgreSQL via Docker Compose, then `npm run build && npm start` (use `prisma migrate deploy` for migrations).
