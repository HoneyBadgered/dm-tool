# DM Tool

A minimal, responsive web app that helps a Dungeon Master run a homebrew D&D campaign during live sessions. This phase only provides the project foundation: app shell, placeholder dashboard, database wiring, and tooling.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL · Prisma · Docker Compose · Vitest · ESLint · Prettier

## Development setup

Requirements: Node.js 20.19+ (developed on 24), npm, Docker.

```bash
cp .env.example .env     # then set POSTGRES_PASSWORD and the password in DATABASE_URL
npm install              # also runs `prisma generate`
docker compose up -d db  # start PostgreSQL
npm run db:migrate       # create/apply migrations
npm run dev              # http://localhost:3000
```

`.env` is git-ignored; only `.env.example` is committed. Never commit credentials.

## Commands

| Command                | Purpose                     |
| ---------------------- | --------------------------- |
| `npm run dev`          | Start dev server            |
| `npm run build`        | Production build            |
| `npm run lint`         | ESLint                      |
| `npm run typecheck`    | TypeScript check            |
| `npm run format`       | Format with Prettier        |
| `npm run format:check` | Verify formatting           |
| `npm test`             | Run Vitest unit tests       |
| `npm run db:generate`  | Generate Prisma client      |
| `npm run db:migrate`   | Create/apply dev migrations |

The dev server and page rendering do not need the database; only code that calls `getDb()` does.

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

## Deployment

Self-hosted on Linux: provide a `.env` on the server, run PostgreSQL via Docker Compose, then `npm run build && npm start` (use `prisma migrate deploy` for migrations).
