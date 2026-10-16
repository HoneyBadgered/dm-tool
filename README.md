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

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Start dev server                                     |
| `npm run build`        | Production build                                     |
| `npm run lint`         | ESLint                                               |
| `npm run typecheck`    | TypeScript check                                     |
| `npm run format`       | Format with Prettier                                 |
| `npm run format:check` | Verify formatting                                    |
| `npm run check`        | lint + typecheck + test + format:check (used by CI)  |
| `npm test`             | Run Vitest unit tests                                |
| `npm run db:generate`  | Generate Prisma client                               |
| `npm run db:migrate`   | Create/apply dev migrations                          |
| `npm run db:sync`      | Generate Prisma client and deploy pending migrations |

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
- Campaigns: CRUD at `/campaigns`, `/campaigns/new`, `/campaigns/[id]` (edit via `?edit`, delete is a soft delete). Service in `src/server/services/campaigns`. After pulling database changes, run `npm run db:sync`. These pages need a running database (`docker compose up -d`). No seed script exists.
- The combat tracker's rules are pure functions in `src/server/services/combat`. Its state is currently persisted in browser `localStorage`; moving it to PostgreSQL is a follow-up.
- Not yet built: auth, NPC/monster library, encounters, story tracker, world board, player portal, dark mode, Playwright tests, app Dockerfile.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every PR.

## Deployment

Self-hosted on Linux: provide a `.env` on the server, run PostgreSQL via Docker Compose, then `npm run build && npm start` (use `prisma migrate deploy` for migrations).
