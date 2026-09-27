# CodePulse

Engineering intelligence for development teams: connect GitHub repositories,
track issues, pull requests, deployments and incidents, and compute metrics
server-side.

## Workspace

| Package             | What it is                                                     |
| ------------------- | -------------------------------------------------------------- |
| `apps/web`          | Next.js 16 App Router UI. All pages and route handlers.        |
| `apps/api`          | Express 5 receiver for GitHub webhooks, plus a BullMQ worker.   |
| `packages/shared`   | Cross-package types, Zod schemas, queue and webhook contracts. |
| `infra`             | Local Redis via Docker Compose.                                 |

The browser only ever talks to the web origin. `apps/web/next.config.ts`
rewrites `/api/ingest/*` to the API service, which keeps the session cookie
`SameSite=Lax` and avoids cross-origin credential handling.

## Setup

```bash
pnpm install
cp .env.example .env        # one env file, at the repo root
pnpm infra:up               # local Redis for the queue
pnpm dev                    # web on :3000, api on :4000
```

MongoDB is not run locally; the app uses MongoDB Atlas. Set
`PROJECT_DATABASE_URL` and `AUTH_DATABASE_URL` in `.env`.

## Commands

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `pnpm dev`        | Build `shared`, then run web and api together.        |
| `pnpm dev:web`    | Web only (`:3000`).                                   |
| `pnpm dev:api`    | API service only (`:4000`).                           |
| `pnpm typecheck`  | `tsc --noEmit` across all three packages.             |
| `pnpm lint`       | ESLint per package.                                   |
| `pnpm build`      | `shared` → `api` → `web`. Order matters.             |
| `pnpm infra:up`   | Start local Redis.                                    |
| `pnpm infra:down` | Stop it.                                              |

## Migrations

One-off scripts live in `apps/web/scripts/` and accept `--dry-run`:

- `migrate-to-orgs.ts` — moves projects from `ownerId` to `organizationId`.
- `fix-invitation-index.ts` — drops the superseded organization-invitation unique index.
  **Required once** on any database created before invitations began keeping history: Mongo keys an
  index by pattern, so the new partial index does not replace the old one, and leaving the old index
  in place makes a *second* acceptance of the same person to the same organization fail with an
  opaque duplicate-key error.

See [`AGENTS.md`](./AGENTS.md) for architecture, auth rules, and the known
`pnpm lint` baseline error.
