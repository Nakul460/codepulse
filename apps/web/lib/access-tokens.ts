import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ACCESS_TOKEN_SCOPES, type AccessTokenScope } from "@codepulse/shared";
import { accessTokenModel } from "@/db/schema";
import type { AccessTokenRecord } from "@codepulse/shared";

/**
 * Personal access tokens.
 *
 * Why opaque and database-backed, rather than a JWT:
 *
 *   - The product needs **immediate revocation** ("this token leaked, kill it
 *     now"). A self-contained JWT stays valid until it expires; making one
 *     revocable means consulting a denylist on every request, at which point
 *     the database is already the source of truth and a JWT buys nothing.
 *   - A database read per request is affordable here. Every route already
 *     touches Mongo for authorization (org membership, project role), so the
 *     token lookup is not the bottleneck it would be in a high-volume service.
 *   - Storing only a hash means a database dump yields no usable credential.
 *
 * Token format: `cp_<id>_<secret>`.
 *
 *   id     12 random bytes, hex. Public, stored in the clear, indexed. It is a
 *          *lookup key*, not a secret: presenting it narrows verification to a
 *          single document.
 *   secret 32 random bytes, hex. Shown to the user once, stored only as
 *          SHA-256, compared in constant time.
 *
 * Both halves are hex, deliberately. base64url's alphabet contains `_`, which is
 * also this format's separator, so a base64url secret would make `split("_")`
 * ambiguous. Hex costs 33% more characters and removes the whole class of bug.
 */

const TOKEN_PREFIX = "cp";
const ID_BYTES = 12;
const SECRET_BYTES = 32;
const ID_HEX_LENGTH = ID_BYTES * 2;
const SECRET_HEX_LENGTH = SECRET_BYTES * 2;

/** Tokens are single-use credentials, so their last-used stamp is coarse. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

export class AccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessTokenError";
  }
}

export interface CreateAccessTokenInput {
  userId: string;
  name: string;
  scopes: AccessTokenScope[];
  /** Days until expiry. Omit for the default; never infinite. */
  expiresInDays?: number;
}

export function isValidScope(value: unknown): value is AccessTokenScope {
  return (
    typeof value === "string" &&
    (ACCESS_TOKEN_SCOPES as readonly string[]).includes(value)
  );
}

export function assertValidExpiry(days: number): void {
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
    throw new AccessTokenError(
      `Expiry must be a whole number of days between 1 and ${MAX_EXPIRY_DAYS}`,
    );
  }
}

/**
 * Mints a token. The returned `secret` is the only time the full token exists
 * outside the user's browser — it is not logged, not emailed, and not stored.
 */
export async function createAccessToken(input: CreateAccessTokenInput): Promise<{
  record: AccessTokenRecord;
  secret: string;
}> {
  const days = input.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  assertValidExpiry(days);

  const scopes = dedupeScopes(input.scopes);
  const id = randomBytes(ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("hex");

  const created = new accessTokenModel({
    id,
    secretHash: hashSecret(secret),
    name: input.name,
    userId: input.userId,
    scopes,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    lastUsedAt: null,
    lastUsedIp: null,
  });

  await created.save();

  return {
    record: toRecord(created.toObject()),
    secret: `${TOKEN_PREFIX}_${id}_${secret}`,
  };
}

function dedupeScopes(scopes: AccessTokenScope[]): AccessTokenScope[] {
  const unique = Array.from(new Set(scopes));
  // "write" subsumes "read"; storing both would be redundant state that can
  // disagree with itself. Any non-read scope implies read.
  if (unique.includes("write") && !unique.includes("read")) {
    unique.push("read");
  }
  return unique.sort(
    (a, b) =>
      ACCESS_TOKEN_SCOPES.indexOf(a) - ACCESS_TOKEN_SCOPES.indexOf(b),
  );
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Splits a presented token into its two halves.
 *
 * Returns null for anything malformed rather than throwing, so a bad header
 * and an unknown token are indistinguishable to the caller.
 */
function parseToken(presented: string): { id: string; secret: string } | null {
  const expectedLength =
    TOKEN_PREFIX.length + 1 + ID_HEX_LENGTH + 1 + SECRET_HEX_LENGTH;

  if (presented.length !== expectedLength) {
    return null;
  }

  if (!presented.startsWith(`${TOKEN_PREFIX}_`)) {
    return null;
  }

  const body = presented.slice(TOKEN_PREFIX.length + 1);
  const id = body.slice(0, ID_HEX_LENGTH);
  const secret = body.slice(ID_HEX_LENGTH + 1);

  if (body[ID_HEX_LENGTH] !== "_") {
    return null;
  }

  if (!isHex(id) || !isHex(secret)) {
    return null;
  }

  return { id, secret };
}

function isHex(value: string): boolean {
  return /^[0-9a-f]+$/.test(value);
}

export interface VerifiedToken {
  userId: string;
  tokenId: string;
  scopes: AccessTokenScope[];
}

/**
 * Resolves a presented bearer token to a user.
 *
 * Returns null for every failure mode — unknown id, wrong secret, revoked,
 * expired — so a caller cannot distinguish "no such token" from "revoked" and
 * probe for valid ids.
 */
export async function verifyAccessToken(
  presented: string,
): Promise<VerifiedToken | null> {
  const parsed = parseToken(presented);

  if (!parsed) {
    return null;
  }

  const document = await accessTokenModel
    .findOne({ id: parsed.id })
    .select("+secretHash userId scopes revokedAt expiresAt")
    .lean();

  if (!document) {
    return null;
  }

  // Constant-time compare. Both sides are 32-byte digests, so the lengths are
  // equal by construction and timingSafeEqual cannot throw.
  const provided = Buffer.from(hashSecret(parsed.secret), "hex");
  const expected = Buffer.from(document.secretHash, "hex");

  if (provided.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  if (document.revokedAt) {
    return null;
  }

  if (document.expiresAt && document.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const scopes = (document.scopes ?? []).filter(isValidScope);

  return {
    userId: document.userId,
    tokenId: document.id,
    scopes: scopes.length > 0 ? scopes : ["read"],
  };
}

/**
 * Records token use, at most once per interval.
 *
 * Deliberately fire-and-forget: a failed usage stamp must never fail the
 * request it was describing, and it is observability, not authorization.
 */
export function recordTokenUse(
  tokenId: string,
  ip: string | null,
): void {
  const cutoff = new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS);

  void accessTokenModel
    .updateOne(
      { id: tokenId, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: cutoff } }] },
      { $set: { lastUsedAt: new Date(), lastUsedIp: ip } },
    )
    .catch((error) => {
      console.error("[tokens] could not record token use:", error.message);
    });
}

/**
 * The caller's tokens, newest first. `secretHash` is `select: false` on the
 * schema, so it is structurally unable to appear in this result.
 */
export async function listAccessTokens(
  userId: string,
): Promise<AccessTokenRecord[]> {
  const documents = await accessTokenModel
    .find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  return documents.map((document) => toRecord(document));
}

export async function revokeAccessToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  // Scoped to userId: a token id from another account must read as "not found"
  // rather than revoking someone else's credential.
  const outcome = await accessTokenModel.updateOne(
    { id: tokenId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return outcome.modifiedCount > 0;
}

export function toRecord(document: {
  id: string;
  name: string;
  scopes?: unknown;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt?: Date | null;
}): AccessTokenRecord {
  return {
    id: document.id,
    name: document.name,
    scopes: Array.isArray(document.scopes)
      ? document.scopes.filter(isValidScope)
      : [],
    expiresAt: document.expiresAt?.toISOString() ?? null,
    revokedAt: document.revokedAt?.toISOString() ?? null,
    lastUsedAt: document.lastUsedAt?.toISOString() ?? null,
    createdAt: document.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
