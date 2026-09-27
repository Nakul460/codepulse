import { headers } from "next/headers";
import { findUserById } from "@/lib/mongo";
import { auth } from "@/lib/auth";
import {
  recordTokenUse,
  verifyAccessToken,
} from "@/lib/access-tokens";
import type { AccessTokenScope } from "@codepulse/shared";

export class UnauthorizedError extends Error {
  constructor(message = "You must be signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this project") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * The request was well-formed and authorized, but conflicts with the current
 * state of the resource — a duplicate that a unique index caught, or a write
 * that would clobber someone else's.
 *
 * Separate from `ForbiddenError` on purpose: 403 tells the caller they may not
 * do this, 409 tells them the world moved underneath them and they should
 * refresh and retry.
 */
export class ConflictError extends Error {
  constructor(message = "That conflicts with something that already exists") {
    super(message);
    this.name = "ConflictError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

/** How the caller proved who they are. */
export type AuthMethod = "session" | "token";

export interface AuthContext {
  user: SessionUser;
  method: AuthMethod;
  /** Present only when `method` is "token". */
  tokenId: string | null;
  scopes: AccessTokenScope[];
}

const BEARER_PREFIX = "bearer ";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header) {
    return null;
  }

  // Scheme names are case-insensitive per RFC 7235, so "Bearer" must work.
  if (header.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX) {
    return null;
  }

  const value = header.slice(BEARER_PREFIX.length).trim();

  return value.length > 0 ? value : null;
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")
  );
}

/**
 * The single authentication entry point for every route.
 *
 * Two mechanisms, one identity:
 *
 *   session  the browser's better-auth cookie. Full access, no scopes — the
 *            user is acting for themselves in their own browser.
 *   token    `Authorization: Bearer cp_<id>_<secret>`, a personal access token
 *            with explicit scopes. This is what makes the API usable from a
 *            CLI or CI job, which has no cookie jar.
 *
 * A session is checked first, so a browser that also holds a token is never
 * downgraded to the token's scopes.
 *
 * A token *never* widens access: it resolves to the same user, and the
 * authorization helpers (`assertOrgAdmin`, `resolveProjectRole`) still decide
 * what that user may do. A token is a way to *authenticate*, not to authorize.
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const headerList = await headers();

  const session = await auth.api.getSession({ headers: headerList });
  const sessionUser = session?.user;

  if (sessionUser?.id) {
    return {
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name ?? "",
        image: sessionUser.image ?? null,
      },
      method: "session",
      tokenId: null,
      scopes: [],
    };
  }

  const presented = readBearerToken(request);

  if (presented) {
    const verified = await verifyAccessToken(presented);

    if (verified) {
      // The token names a user id, but that user may have been deleted since
      // the token was issued. Resolve the user rather than trusting the id.
      const user = await findUserById(verified.userId);

      if (user) {
        recordTokenUse(verified.tokenId, clientIp(request));

        return {
          user: {
            id: user.id ?? user._id.toString(),
            email: user.email,
            name: user.name ?? "",
            image: user.image ?? null,
          },
          method: "token",
          tokenId: verified.tokenId,
          scopes: verified.scopes,
        };
      }
    }
  }

  // One message for "no credential", "bad token", "revoked" and "expired", so a
  // caller cannot use the error to tell whether a token id exists.
  throw new UnauthorizedError();
}

/**
 * Requires write access.
 *
 * Call this on every mutating route alongside `assertSameOrigin`. A session
 * always passes: the user is in their own browser acting on their own behalf.
 * A token must carry the `write` scope, which is the whole point of issuing
 * read-only tokens for dashboards and CI checks.
 */
export function assertWriteScope(context: AuthContext): void {
  if (context.method === "session") {
    return;
  }

  if (!context.scopes.includes("write")) {
    throw new ForbiddenError("This token is read-only");
  }
}

/**
 * The identity half of `requireAuth`, for the routes that do not care how the
 * caller authenticated. Accepts a session cookie or a bearer token.
 *
 * The `request` argument is required on purpose. An optional one would let new
 * and existing call sites omit it and silently reject every token client, which
 * is exactly the kind of half-wired auth that looks finished and is not.
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  return (await requireAuth(request)).user;
}

/**
 * The identity half of `requireAuth`, for routes that must **not** accept a
 * token at all — currently the access-token management routes.
 *
 * This is deliberately stricter than `requireUser` plus `assertWriteScope`. A
 * `write` token that could mint more tokens, or revoke the list of them, would
 * be able to escalate itself into a durable credential that outlives its own
 * expiry and survives a session logout. Reading the cookie and nothing else
 * means the token path is never even consulted, so there is no hash comparison
 * to race and no "last used" bookkeeping for a request that was always going to
 * be refused.
 *
 * Takes no `request`: a token in the `Authorization` header is not a credential
 * this route can use, so there is no reason to read one.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const sessionUser = (await auth.api.getSession({ headers: await headers() }))?.user;

  if (!sessionUser?.id) {
    throw new UnauthorizedError();
  }

  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name ?? "",
    image: sessionUser.image ?? null,
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return { status: 401, message: error.message };
  }

  if (error instanceof ForbiddenError) {
    return { status: 403, message: error.message };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, message: error.message };
  }

  if (error instanceof ConflictError) {
    return { status: 409, message: error.message };
  }

  return { status: 500, message: "Something went wrong" };
}

/**
 * Second line of defence against CSRF for mutating requests.
 *
 * Today the session cookie is SameSite=Lax, which already blocks cross-site
 * POST/PATCH/DELETE. This guard means that if SameSite is ever relaxed to
 * "none" (a routine change for a cross-origin frontend) these routes do not
 * silently become CSRF-exploitable.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script,
 * so it is checked first. Requests carrying neither header are non-browser
 * clients (curl, server-to-server), which cannot be CSRF vectors.
 */
export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new ForbiddenError("Cross-site request rejected");
  }

  const origin = request.headers.get("origin");

  if (origin && origin !== "null") {
    const expected = new URL(request.url).origin;

    if (origin !== expected) {
      throw new ForbiddenError("Cross-site request rejected");
    }
  }
}
