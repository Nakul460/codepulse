<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CodePulse

## Current state (verified)

Shipped: better-auth login, organizations, projects with role-based access, an activity/audit feed, GitHub repository connection and management UI, a signature-verifying webhook receiver and workers for event ingestion plus webhook-triggered and scheduled repository backfills, **personal access tokens** with read/write scopes for API and CI clients, and **account management** at `/dashboard/account` (email verification status, password, signed-in devices, connected accounts, tokens, deletion).

**Before assuming a capability exists, verify it in `apps/web/db/schema.ts` and `apps/web/app/api/`.** Nothing further down this file is built unless the section says so.

Stack: pnpm workspace with three packages — `apps/web` (Next.js 16 App Router, Turbopack, React 19.2, Tailwind v4), `apps/api` (Express 5, BullMQ, Mongoose, TypeScript), and `packages/shared` (types, Zod schemas, queue/envelope contracts). Mongo is shared by web and API; the queue needs Redis.

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

## GitHub integration

- **No secret is stored in the database.** GitHub installation tokens expire in an hour, so persisting one would leave a dead credential. The App private key lives in `GITHUB_APP_PRIVATE_KEY` and tokens are minted on demand, cached in memory on `globalThis` until five minutes before expiry (`lib/github.ts`).
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` are better-auth **social login** and are unrelated to the App (`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`). Don't reuse the names or the credentials.
- The App JWT is hand-built RS256 with `node:crypto` rather than a JWT library: the payload is three fixed claims, so no untrusted input reaches the signature.
- **The install flow is the one place `assertSameOrigin` must not be used.** `/api/repositories/install` and `/api/repositories/callback` are top-level navigations to and from github.com, so the CSRF guard would correctly reject them. The defence is the HMAC-signed `state` in `signInstallState` / `verifyInstallState`, which names both the org and the user; the callback re-checks `state.userId` against the session *and* re-runs `assertOrgAdmin`, because the round trip is long enough for the admin to have been demoted.
- One installation backs exactly one organization. `recordInstallation` refuses to re-point it, and never steals a repository that another organization already holds — those come back in `skipped`.
- `installations/new` is the **all-repositories** install, so every granted repo is attached. `listInstallationRepositories` paginates and caps at 10 pages, logging a warning if it truncates.
- `/dashboard/repositories` supports connection, disconnect, manual sync, sync status, webhook setup, and repository history views.
- Repository data is ingested from `push`, `pull_request`, `issues`, `create`, `delete`, `deployment`, and `deployment_status` events, with bounded REST backfills for commits, pull requests, issues, branches, and deployments. Up to 50 recent deployment statuses are reconciled per backfill. A worker discovery loop queues initial and daily-stale syncs. `lastSyncedAt` advances only after a complete backfill. Manual sync requires the same `API_INTERNAL_SECRET` in web and API environments. Runtime processing still needs Redis + Mongo verification.
- The repository screen can set the GitHub App webhook URL and secret. App event subscriptions and repository permissions must still be selected in GitHub App settings; the screen checks and reports gaps.

## Decided, not yet built

- Data comes from a **real GitHub App**. The OAuth install flow (`apps/web/app/api/repositories/install|callback`), signature-verifying receiver, on-demand installation token minting, webhook registration, webhook-triggered and scheduled sync, and user-facing manual sync/status UI exist. App event subscriptions and permissions still require selection in GitHub App settings.
- The *encrypted installation token* part of the original plan was wrong and was not built — tokens expire hourly, so they are minted on demand instead of stored.
- Metrics (cycle time, bug frequency, developer activity, failed deployments) compute in **server-side aggregation endpoints**, not in the browser. This deliberately breaks the client-fetch pattern below, which is why that bullet is worded the way it is.
- **The browser-to-API seam is settled**: a Next rewrite, not cross-origin fetch. Don't introduce CORS as a design dependency in app code.

## Workspace layout

- `apps/web` — the Next app. Everything that renders is here. Root `package.json` is a workspace, not the app; the app is `apps/web/package.json`.
- `apps/api` — the Express service (`server.ts`) and the BullMQ worker (`worker.ts`), sharing `src/` via distinct entrypoints. The webhook receiver lives in `src/ingest/webhook.ts`.
- `packages/shared` — cross-package contracts only: roles/status labels, record and API-error types, the webhook envelope, and queue names. It **compiles to `dist`** (real `.js` + `.d.ts`), it does not ship TypeScript source, because the web app's bundler will not remap `.js` → `.ts` inside a workspace dependency. Rebuild it after editing it.
- `infra/docker-compose.yml` — local Redis. Mongo is Atlas, not local.
- Contracts a UI cannot import from `apps/api` belong in `packages/shared`; logic does not. The web app must not import server modules from the API.

## The API service and the ingest queue

- `POST /api/ingest/github` verifies the signature, records a `WebhookDelivery`, and enqueues. The worker ingests `push`, `pull_request`, and `issues` idempotently; other subscribed events are marked ignored. Supported events enqueue a bounded repository backfill. Delivery and sync records carry correlation ids.
- The receiver authenticates by HMAC, **not** by session, so it does not call `requireUser()` and is not affected by the mutating-handler CSRF rules in "Auth and authorization".
- **Signature is computed over the raw request bytes.** The route registers `express.raw()` itself and must stay ahead of any global JSON body parser. Re-serializing the parsed JSON changes the bytes and the digest never matches.
- Idempotency comes from the unique index on `WebhookDelivery.deliveryId`, caught as E11000 → 200. Do not replace it with a read-then-write check, which races concurrent redeliveries.
- `ping` is acknowledged **without** being queued, or GitHub marks the webhook as failing during App setup. Unmodelled events return 202 and are dropped, so GitHub does not retry forever.
- The browser reaches the API through a Next rewrite in `apps/web/next.config.ts` (`/api/ingest/*` → `API_INTERNAL_URL`, default `http://localhost:4000`). **This is deliberate**: it keeps one browser origin so the better-auth cookie stays `SameSite=Lax` and no cross-origin credential handling is needed. CORS in `server.ts` is for local development only.
- The worker has no Redis locally unless `pnpm infra:up` is running; a `push` delivery will fail at the enqueue step. The `ping` and signature paths are testable without any infrastructure.

## Commands

- `pnpm dev` — builds `shared`, then runs web (:3000) and api (:4000) in parallel. `pnpm dev:web` / `pnpm dev:api` for one of them.
- `pnpm typecheck` — `tsc --noEmit` in all three packages.
- `pnpm lint` — bare `eslint` per package (Next 16 removed `next lint`). **Currently exits 1** with one pre-existing error: `react-hooks/set-state-in-effect` in `apps/web/hooks/use-mobile.ts` (shadcn-generated). That is the baseline, not your regression.
- `pnpm build` — shared, then api, then web. **Order matters**: web and api both import `@codepulse/shared`, which must be compiled first.
- `pnpm infra:up` / `pnpm infra:down` — local Redis via Docker.
- **`RouteContext<...>` comes from generated types in `apps/web/.next/types`, so a brand-new dynamic route fails typecheck until you build (or run `next dev`).** A `Type '"/api/..."' does not satisfy the constraint 'AppRouteHandlerRoutes'` error means exactly that, not a bad path.
- No test runner, no CI, no pre-commit hooks, no formatter. Verification = `typecheck` + `lint` + `build`, plus manual calls against a running dev server.
- There is exactly one `.env`, at the **repo root**, shared by all three packages. Next loads `.env` from `apps/web`, and Next 16 has **no `envDir` option** — `apps/web/next.config.ts` calls `process.loadEnvFile()` on the root file instead, letting real environment values win. `apps/api/src/env.ts` does the same for the API and worker. `.env.example` is the tracked reference.

## Two databases, two clients

- `AUTH_DATABASE_URL` → raw `mongodb` driver via `apps/web/lib/mongo.ts` (`getAuthDb()`): better-auth's user/session/account collections. **The API service must never touch this database** — it holds user sessions and the webhook receiver has none.
- `PROJECT_DATABASE_URL` → Mongoose via `apps/web/db/db.ts` (`connectProjectDB()`) and `apps/web/db/schema.ts` (every model). The API opens its **own independent Mongoose connection** in `apps/api/src/db.ts`; each side caches its own on `globalThis` because dev hot-reload re-imports modules. Two pools against one cluster is intentional.
- `apps/web/lib/mongo.ts` hand-validates the email in `findUserByEmail` — raw collection queries skip Mongoose casting and have no injection defence.
- Local env lives in `.env` at the repo root (not `.env.local`); `.env*` is gitignored. `apps/web/scripts/migrate-to-orgs.ts` uses `process.loadEnvFile()`, so it only sees `.env`. `.env.example` is the tracked reference for which variables exist and what breaks without them — it carries the two-database split and the `EMAIL_FROM` caveat.

## Auth and authorization

- Every route handler starts with `requireUser()` (`apps/web/lib/session.ts`); its `Unauthorized/Forbidden/NotFound` errors map to 401/403/404 via `toErrorResponse`.
- **`requireUser` requires its `request` argument** — it is not optional, so no call site can silently skip bearer support. Omitting it is the half-wired-auth failure mode: it compiles, rejects every token client, and looks finished.
- **Mutating handlers call `assertSameOrigin(request)` first** — that is the CSRF guard. Don't drop it in new routes.
- **`?next=` redirect targets go through `safeInternalPath` (`lib/redirect.ts`), never raw.** It rejects absolute URLs, protocol-relative `//host`, backslash `'/\host'` forms that browsers normalise to `//host`, and anything containing whitespace or control characters. A post-login redirect to another origin is an open redirect, and on a real login page it is the basis of a convincing phishing flow. Sanitise on the server in the page component, not in the client component that consumes it. Used by `/login` and `/signup` so a recipient following an invitation link comes back to it after authenticating.
- **Personal access tokens.** `requireAuth` accepts either the browser cookie or `Authorization: Bearer cp_<id>_<secret>`, and returns an `AuthContext` (`method: "session" | "token"`). Mutating routes then call `assertWriteScope(auth)`, which is a no-op for a session and requires the `write` scope otherwise.
  - Tokens are opaque and **DB-backed, not JWT**, deliberately: revocation is a single write. better-auth's `apiKey` plugin was rejected because it stores the token in plaintext; its `bearer` plugin only bridges an existing session and was not used.
  - Only a SHA-256 hash of the secret is stored (`secretHash`, `select: false`); the plaintext is returned exactly once by `POST /api/tokens` and is unrecoverable after that. No code path can re-display it.
  - Scopes are `read` / `write`, with `write` implying `read`. Expiry defaults to 90 days and is capped at 365.
  - A token **never widens authorization** — it resolves to the same user, and `assertOrgAdmin` / `resolveProjectRole` still decide what that user may do. It is a way to *authenticate*, not to authorize.
  - A **session wins over a token** and is never downgraded to the token's scopes. Don't "fix" this by rejecting requests that carry both.
  - `assertWriteScope` returns **403** ("This token is read-only") — the one place that isn't 404, since the caller's own token scope is not information about an outsider's resource.
  - **`/api/tokens` management is session-only**, via `requireSessionUser()`, not `requireUser()`. A `write` token that could mint more tokens or revoke the list of them could escalate itself into a credential that outlives its own expiry and survives a session logout. `requireSessionUser` reads the cookie and never consults the `Authorization` header, so there is no hash comparison to race and no last-used bookkeeping for a request that was always going to be refused.
  - `verifyAccessToken` is called with a raw `Authorization` header but compares hashes with `timingSafeEqual`. A bad, expired or revoked token all produce the **same** 401, so the error cannot be used to probe which token ids exist.
  - **Trap:** better-auth's MongoDB adapter persists **no `id` field** on user documents — the canonical user id is the hex string of `_id`, which is what `session.userId` and `SessionUser.id` contain. `findUserById` therefore queries `_id` via `ObjectId` for a 24-hex id and falls back to `{ id }` otherwise. Querying `{ id: userId }` alone matches nothing and makes every token request a silent 401.
- Denied access intentionally returns 404, not 403, so project/org existence isn't leaked to outsiders. Preserve that.
- Effective project role (`resolveProjectRole` in `apps/web/lib/projects.ts`): org admin → `owner`, org member → `editor`, project member → their explicit role, else none.
- **Permissions are one matrix, in shared code.** `packages/shared/src/permissions.ts` holds `ORG_PERMISSION_MATRIX` (org `admin`/`member`) and `PROJECT_PERMISSION_MATRIX` (project `owner`/`editor`/`viewer`). Check with `orgCan` / `projectCan`, or with the route guards `assertOrgPermission` (`lib/organizations.ts`) and the capability helpers in `lib/projects.ts`. **Never compare a role inline** — `user.role === "admin"` in a route or component is a bug, because it is a second answer to "what may this role do" that nothing keeps in sync.
  - The matrices are exhaustive over the role union types, so adding a role without deciding its permissions is a **typecheck error**, not a silent grant. That is the property worth protecting: if you ever loosen the type, the guarantee is gone.
  - `view_members` is **admin-only**, stricter than "members may see the list", because a member list is a map of who to phish. Org `member` therefore has `view` only.
  - The 5-role plan (`OWNER`/`ADMIN`/`MANAGER`/`DEVELOPER`/`VIEWER`) in `todo.md` was **amended, not implemented** — it mixed seniority with capability. `MANAGER`/`DEVELOPER` have no code and no data; adding them later is additive.
- **Members are added by invitation only.** `POST /api/organizations/[orgId]/members` no longer exists (405). It granted organization access to whoever owned a typed-in address, and its only guard (`emailVerified`) was itself skipped whenever no mail sender was configured. Adding is now `POST /api/organizations/[orgId]/invitations`; the membership row is written only after the recipient proves they control the mailbox.
  - `lib/invitations.ts` is the only place that may create a membership from an invitation. The role comes from the stored invitation, never from the request body, and is re-checked against `ORG_ROLES` at grant time — a hand-edited document must not be able to invent a role the matrix has no row for.
  - Tokens are 32 random bytes; only a SHA-256 hash is stored, and `tokenHash` is `select: false`. The raw token is returned exactly once (to the email) and never in an API response.
  - **Accept and decline are session-only** (`requireSessionUser`). A PAT must not be able to convert an invitation into org access. The *preview* is deliberately unauthenticated, because the flow exists to tell a signed-out recipient which address to sign in as; it returns only what the email already disclosed.
  - Invitation **address matching** is enforced inside `lib/invitations.ts`, not in the route, so it cannot be skipped by reaching the same operation through the other entry point. The error never names the invited address, so the endpoint is not an oracle for who has been invited.
  - Accepted/declined invitations are **kept as history**, and a partial unique index (`one_pending_invitation_per_email`) allows that while still permitting only one live invitation per address per org.
  - **Deployment consequence:** the old `{organizationId, email, status}` unique index must be dropped on any database that already has it — Mongo identifies an index by key pattern, so changing the schema does **not** replace it, and Mongoose would create the new index alongside the old one. Left in place, the old index rejects a second acceptance of the same person to the same org. Run `npx tsx scripts/fix-invitation-index.ts --dry-run` (from `apps/web`), then without the flag. It is idempotent, and it refuses to proceed if duplicate pending invitations exist so that is diagnosed up front rather than as a confusing accept-time error.
  - `:tokenOrId` serves **both** the emailed token and the dashboard's by-id accept. Next requires one dynamic-segment name per position, and both branches independently require the invitation be addressed to this session's address, so dispatching on shape can only fail closed.
- **`findUserByEmail` returns `AuthUserWithId`, not `AuthUserRecord`, so `invitee.id` is always the canonical user id.** This is the same trap as the `findUserById` note above, and it caused a total outage: `AuthUserRecord.id` is optional because the adapter persists no `id` field, so `findOne({ organizationId, userId: invitee.id })` was called with `userId: undefined`. Mongoose **drops `undefined` keys from a filter**, so the query silently degraded to `{ organizationId }` and matched *any* existing member. Every org has at least its creator, so every add returned 409 "That person is already a member" and **no team member could ever be added**. TypeScript could not catch it — the field was correctly typed `string | undefined` and assigning that to a filter is legal.
  - The guarantee now lives in the return type (`lib/mongo.ts`), at the boundary, rather than in a comment at each call site. Don't widen it back to `AuthUserRecord`, and don't reintroduce an optional `id` read in a new lookup.
  - Same bug, same fix, in `app/api/projects/[projectId]/members/route.ts`. Both were broken; a fix in only one of them would have left the other returning 409 for everything.
- **Mongoose silently drops `undefined` from query filters.** Any `findOne({ field: maybeUndefined })` degrades to a *broader* query, never a narrower one, so the failure is a wrong answer rather than an error. Where an optional value could reach a filter, resolve it to a definite id first.
- `EMAIL_FROM` **and** `RESEND_API_KEY` both set ⇒ `emailVerificationAvailable === true` ⇒ better-auth enforces verification. Missing either ⇒ verification is skipped and a warning logs at startup. Invitations are the sharper reason this matters: without a verified address, an invitation proves nothing, so the recipient must already be able to receive mail. That's the expected state without email configured — don't "fix" it by making verification unconditional. Both are required because a sender with no API key enforces verification while every send fails inside a swallowed `catch`, leaving unverifiable accounts and no error.
- **`lib/auth.ts` throws at startup in production** when either mail variable is missing, exempting only `NEXT_PHASE === "phase-production-build"`. Without a sender, signup is an account-takeover hole: someone registers another person's address and inherits that address's org access when it's added later. Discovering that from an incident is worse than a failed deploy.
- **Account management is built**: `/dashboard/account` (sidebar entry, no `?org=` — it's about the person, not the active org), `lib/account.ts`, `lib/account-deletion.ts`, and seven `/api/account/*` routes. It also renders the token UI, so there is no separate tokens page.
  - **All account routes are session-only** (`requireSessionUser`). Reading which providers someone has linked, enumerating their devices, and deleting the account are identity operations, so a leaked PAT must not reach them. Keep it that way when adding routes.
  - `currentPassword` is optional in `changePasswordSchema` so an OAuth-only account can set a *first* password. That is safe **only** because the route branches to better-auth's `setPassword`, which returns `{ status: false }` when a credential account already exists. Don't collapse the two branches.
  - Deletion is refused while the user is an organization's **sole admin** (surfaced in the UI, not just at submit), and the `afterDelete` hook drops the user's PATs and memberships while **keeping** activity rows in other people's orgs/projects so their audit history survives.
  - `listSessions` returns raw session tokens, so `listDeviceSessions` strips them. Unknown session id ⇒ 404, not 401.
  - The "new device" label is a heuristic over *live* sessions, not a stored login history, and there is no alert email. It includes the current session's own signature on purpose — otherwise a second tab on the device you're using is flagged as new and the label gets ignored.
- **better-auth 1.7.5 has no `bruteForceProtection` plugin and no refresh tokens.** Credential throttling is `rateLimit.customRules` (sign-in/signup 5/min, verification and password reset 3/min) with **no account lockout**, so a lockout can't be turned into a denial-of-service against a real user. better-call's `APIError` carries `{ status, body: { message, code } }`; key on `body.code` and use `isAPIError`, never on the message.
- **There is deliberately no global app-API rate limiter.** Every `/api/*` route needs a session or a PAT, so there is no unauthenticated surface to throttle. Don't add an in-memory limiter to compensate.
- **`lib/password-policy.ts` is the single source of truth** for the password policy and is enforced inside better-auth's `password.hash` funnel, so no endpoint can bypass it. `lib/signup-schema.ts` and the account page's checklist both render that same `PASSWORD_REQUIREMENTS` array — don't restate the rules, or the UI drifts from what the server rejects.
- **`lib/social-providers.ts` is the single source of truth for which OAuth providers are configured.** `lib/auth.ts` registers providers from it, and the server-rendered login/signup pages pass the same list down as a prop. It cannot be computed in the browser (the client ids aren't `NEXT_PUBLIC_`), which is why it is a prop and not a client-side check. A credential-less provider is left unregistered, so its endpoint 404s instead of failing mid-handshake.
- `proxy.ts` (Next 16's replacement for `middleware.ts`) only redirects `/` → `/dashboard` when a session cookie is present. It is a UX redirect, not an auth check; the real gate is `app/dashboard/layout.tsx`.

## Architecture

- Every page under `app/dashboard` is a client component that fetches its own data through `apps/web/lib/api.ts` → route handlers. There is essentially no server-side data fetching. This is the right pattern for CRUD lists — keep new list/detail UI on it. It is the **wrong** pattern for aggregates (see "Decided, not yet built"); those get server-side aggregation endpoints.
- Active org is `localStorage` + context (`components/organization-provider.tsx`); the archived toggle is the URL (`?archived=1`) deliberately, for shareable/back-forward-safe state. Don't introduce a second source of truth.
- Audit trail: `logActivity` (project) and `logOrgActivity` (org). `logOrgActivity` deliberately swallows errors so a failed audit write can't 500 the mutation the user asked for. Repository connect/disconnect is audited through `logOrgActivity` (actions `github.installed`, `repo.disconnected`) — repositories are not projects and have no `ProjectActivity` row.
- `apps/web/lib/validation.ts` owns all web-side zod schemas. Role/status/action enums and their display labels now live in `packages/shared/src/roles.ts` and are re-exported by `apps/web/lib/project-status.ts`, so the API can use them too — add values there, not inline. Two traps: `updateProjectSchema` intentionally omits defaults so a PATCH can't wipe fields, and start/end date ordering is checked in the handler against the stored project because a patch usually carries one date.
- Route handlers use the generated `type Context = RouteContext<"/api/...">` and `await ctx.params` (Next 16 async params).

## UI stack gotchas

- shadcn style is `base-nova` on **@base-ui/react**, not Radix — `@radix-ui/*` is not installed. Radix-based snippets from the web or shadcn docs will not work; follow the existing `components/ui/*` files.
- `cn` comes from the `cn` package (`lib/utils.ts`), not clsx + tailwind-merge.
- `@tanstack/react-table` is **v9**: capabilities are registered in `app/dashboard/table-features.tsx`, and `DataTableFeatures` is the first generic argument of `ColumnDef` / `createColumnHelper`. New table behavior means adding the feature there, not a v8-style plugin.
- Project status colors are custom `--status-*` tokens in `app/globals.css` (consumed as `text-status-ongoing`, etc.).
- Style is not uniform: app code uses semicolons, shadcn-generated `components/ui/*` files do not. Match the file you're editing.
