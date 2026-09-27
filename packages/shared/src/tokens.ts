/**
 * Access token contracts.
 *
 * CodePulse issues opaque, database-backed bearer tokens for programmatic
 * access (CLI, CI, integrations) alongside the browser's session cookie. The
 * two are deliberately different mechanisms: the cookie is a session the server
 * owns, while a token is a credential the user carries and can revoke.
 *
 * These tokens are **not JWTs**. See apps/web/lib/access-tokens.ts for why.
 */

/**
 * Ordered least- to most-privileged. `write` implies `read`; there is no
 * separate "admin" scope because a token can already do everything its owner's
 * session can, including administering organizations.
 */
export const ACCESS_TOKEN_SCOPES = ["read", "write"] as const;

export type AccessTokenScope = (typeof ACCESS_TOKEN_SCOPES)[number];

/** The wire shape. Carries no secret: a token's value is shown exactly once. */
export interface AccessTokenRecord {
  id: string;
  name: string;
  scopes: AccessTokenScope[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Returned once, by `POST /api/tokens`, and never again. `warning` is the
 * product's one chance to tell the user this value will not be recoverable.
 */
export interface CreatedAccessToken {
  token: AccessTokenRecord;
  /** The literal `cp_<id>_<secret>` string. Never persisted, never logged. */
  secret: string;
  warning: string;
}
