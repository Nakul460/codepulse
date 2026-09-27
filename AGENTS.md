<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CodePulse

## Current state (verified)

Shipped: better-auth login, organizations, projects with role-based access, and an activity/audit feed. That is the whole app. `db/schema.ts` holds exactly six models — Organization, OrganizationMember, Project, ProjectMember, ProjectActivity, OrganizationActivity — and the sidebar has two entries, Projects and Settings.

**Before assuming a capability exists, verify it in `db/schema.ts` and `app/api/`.** Nothing further down this file is built unless the section says so.

Stack: Next.js 16 App Router (Turbopack), React 19.2, Tailwind v4, Mongoose + raw Mongo driver, pnpm. Single package (`package.json` name is `client`; `pnpm-workspace.yaml` only denies build scripts for `sharp`/`unrs-resolver`).

## Target direction (not yet built)

A platform where development teams connect their repositories and manage projects, issues, deployments, incidents, and engineering metrics from one place.

A team creates a workspace:

Acme Engineering
│
├── Projects
│   ├── E-commerce API
│   ├── Mobile App
│   └── Admin Dashboard
│
├── Issues
├── Sprints
├── Deployments
├── Incidents
├── Pull Requests
├── Team
└── Analytics

Then developers can connect a Git repository.

Your system analyzes:

commits
pull requests
issues
deployment history
developer activity
cycle time
bug frequency
failed deployments
incident history

And turns that into an engineering dashboard

## Decided, not yet built

- Data comes from a **real GitHub App**: OAuth install, webhook secret, encrypted installation token, and a sync runner. Note the existing `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in `.env` are better-auth *social login* — a different credential. Don't reuse those names for the App.
- Metrics (cycle time, bug frequency, developer activity, failed deployments) compute in **server-side aggregation endpoints**, not in the browser. This deliberately breaks the client-fetch pattern below, which is why that bullet is worded the way it is.
- A webhook receiver authenticates by signature, so it will **not** start with `requireUser()`. The Auth section below is therefore not the whole story for future routes.

## Commands

- `pnpm dev` — dev server on :3000. A second `next dev` prints the already-running URL + PID from `.next/dev/lock`; don't start duplicates.
- `pnpm exec tsc --noEmit` — there is no `typecheck` script; this is it.
- `pnpm lint` — bare `eslint` (Next 16 removed `next lint`). **Currently exits 1** with one pre-existing error: `react-hooks/set-state-in-effect` in `hooks/use-mobile.ts` (shadcn-generated). That is the baseline, not your regression.
- `pnpm build` — type-checks and builds; currently passes. Needs env (below), because `lib/auth.ts` opens the auth DB at import time.
- No test runner, no CI, no pre-commit hooks, no formatter. Verification = `tsc` + `lint` + `build` or the running dev server.

## Two databases, two clients

- `AUTH_DATABASE_URL` → raw `mongodb` driver via `lib/mongo.ts` (`getAuthDb()`): better-auth's user/session/account collections.
- `PROJECT_DATABASE_URL` → Mongoose via `db/db.ts` (`connectProjectDB()`) and `db/schema.ts` (every model). Both cache their connection on `globalThis` because dev hot-reload re-imports modules.
- `lib/mongo.ts` hand-validates the email in `findUserByEmail` — raw collection queries skip Mongoose casting and have no injection defence.
- Local env lives in `.env` (not `.env.local`); `.env*` is gitignored. `scripts/migrate-to-orgs.ts` uses `process.loadEnvFile()`, so it only sees `.env`. `.env.example` is the tracked reference for which variables exist and what breaks without them — it carries the two-database split and the `EMAIL_FROM` caveat.

## Auth and authorization

- Every route handler starts with `requireUser()` (`lib/session.ts`); its `Unauthorized/Forbidden/NotFound` errors map to 401/403/404 via `toErrorResponse`.
- **Mutating handlers call `assertSameOrigin(request)` first** — that is the CSRF guard. Don't drop it in new routes.
- Denied access intentionally returns 404, not 403, so project/org existence isn't leaked to outsiders. Preserve that.
- Effective project role (`resolveProjectRole` in `lib/projects.ts`): org admin → `owner`, org member → `editor`, project member → their explicit role, else none. Org checks are `getOrgRole` / `assertOrgAdmin` (`lib/organizations.ts`).
- Membership rows are keyed to a `userId` looked up by email. New org members always join as `member`; promotion to admin is a separate explicit PATCH (`addOrgMemberSchema` deliberately has no `role`).
- `EMAIL_FROM` unset ⇒ `emailVerificationAvailable === false` ⇒ better-auth skips verification, a warning logs at startup, and member-add skips the verified-email check. That's the expected state without email configured — don't "fix" it by making verification unconditional.
- `proxy.ts` (Next 16's replacement for `middleware.ts`) only redirects `/` → `/dashboard` when a session cookie is present. It is a UX redirect, not an auth check; the real gate is `app/dashboard/layout.tsx`.

## Architecture

- Every page under `app/dashboard` is a client component that fetches its own data through `lib/api.ts` → route handlers. There is essentially no server-side data fetching. This is the right pattern for CRUD lists — keep new list/detail UI on it. It is the **wrong** pattern for aggregates (see "Decided, not yet built"); those get server-side aggregation endpoints.
- Active org is `localStorage` + context (`components/organization-provider.tsx`); the archived toggle is the URL (`?archived=1`) deliberately, for shareable/back-forward-safe state. Don't introduce a second source of truth.
- Audit trail: `logActivity` (project) and `logOrgActivity` (org). `logOrgActivity` deliberately swallows errors so a failed audit write can't 500 the mutation the user asked for.
- `lib/validation.ts` owns all zod schemas; `lib/project-status.ts` owns every role/status/action enum and its display label. Add values there, not inline. Two traps: `updateProjectSchema` intentionally omits defaults so a PATCH can't wipe fields, and start/end date ordering is checked in the handler against the stored project because a patch usually carries one date.
- Route handlers use the generated `type Context = RouteContext<"/api/...">` and `await ctx.params` (Next 16 async params).

## UI stack gotchas

- shadcn style is `base-nova` on **@base-ui/react**, not Radix — `@radix-ui/*` is not installed. Radix-based snippets from the web or shadcn docs will not work; follow the existing `components/ui/*` files.
- `cn` comes from the `cn` package (`lib/utils.ts`), not clsx + tailwind-merge.
- `@tanstack/react-table` is **v9**: capabilities are registered in `app/dashboard/table-features.tsx`, and `DataTableFeatures` is the first generic argument of `ColumnDef` / `createColumnHelper`. New table behavior means adding the feature there, not a v8-style plugin.
- Project status colors are custom `--status-*` tokens in `app/globals.css` (consumed as `text-status-ongoing`, etc.).
- Style is not uniform: app code uses semicolons, shadcn-generated `components/ui/*` files do not. Match the file you're editing.
