import { MongoClient, ObjectId, type Db } from "mongodb";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const globalForMongo = globalThis as unknown as {
  authMongoClient?: MongoClient;
  authMongoDb?: Db;
};

function getClient() {
  const url = process.env.AUTH_DATABASE_URL;

  if (!url) {
    throw new Error("AUTH_DATABASE_URL is not set");
  }

  if (!globalForMongo.authMongoClient) {
    globalForMongo.authMongoClient = new MongoClient(url);
  }

  return globalForMongo.authMongoClient;
}

export function getAuthDb(): Db {
  if (!globalForMongo.authMongoDb) {
    globalForMongo.authMongoDb = getClient().db();
  }

  return globalForMongo.authMongoDb;
}

export interface AuthUserRecord {
  /**
   * The MongoDB primary key, and — see `findUserById` — the identifier
   * better-auth actually exposes to this app. Typed as `ObjectId` rather than
   * `{ toString() }` so it can be used in a filter.
   */
  _id: ObjectId;
  /**
   * Not persisted by the MongoDB adapter in this deployment — user documents
   * carry only `_id`, and better-auth's session `userId` is that ObjectId's hex
   * string. Kept optional so a future adapter that does write `id` still works.
   *
   * **Do not read `.id` off a record from `findUserByEmail`/`findUserById` and
   * use it as a value.** It is optional precisely because it is usually absent,
   * and an `undefined` here is silently destructive rather than merely wrong —
   * see the returned type of those functions and `withCanonicalId`.
   */
  id?: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string;
}

/**
 * An `AuthUserRecord` whose `id` is **guaranteed** to be the identifier
 * better-auth uses, i.e. the `_id` hex string.
 *
 * This type exists because the optional `AuthUserRecord.id` caused a real,
 * total outage of a feature. The member-add routes did
 * `findOne({ organizationId, userId: invitee.id })` with `invitee.id`
 * `undefined`; Mongoose drops `undefined` keys from a filter, so the query
 * silently degraded to `{ organizationId }` and matched *any* existing member.
 * Since every organization has at least its creator as a member, every add
 * attempt returned 409 "That person is already a member" and **no team member
 * could ever be added**. TypeScript could not catch it, because the field was
 * correctly typed as `string | undefined` and assigning it to a `string` filter
 * is legal.
 *
 * So the guarantee is made in the type system, at the boundary, rather than
 * left to each call site to remember.
 */
export type AuthUserWithId = AuthUserRecord & { id: string };

/**
 * Normalises a raw user document so `id` is always the `_id` hex string.
 *
 * The adapter writes no `id` field in this deployment, so this is normally just
 * `_id.toHexString()`. A persisted `id` is still honoured if a future adapter
 * writes one, since that is the value better-auth would use.
 */
function withCanonicalId(user: AuthUserRecord): AuthUserWithId {
  return { ...user, id: user.id ?? user._id.toHexString() };
}

/**
 * Looks a user up by email, for membership grants.
 *
 * The returned `id` is safe to use as a value — see `AuthUserWithId`. Callers
 * that key a membership row to the invitee must use it, not `invitee._id` and
 * never the raw optional `id`.
 */
export async function findUserByEmail(
  email: string,
): Promise<AuthUserWithId | null> {
  // This query bypasses Mongoose's casting, so it has no injection defence of
  // its own. Validate here rather than trusting every caller's schema — a
  // relaxed schema would otherwise allow {"email": {"$ne": null}}.
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return null;
  }

  const users = getAuthDb().collection<AuthUserRecord>("user");
  const user = await users.findOne({ email: email.toLowerCase() });

  return user ? withCanonicalId(user) : null;
}

/**
 * Looks a user up by their better-auth id.
 *
 * Used by the access-token path: a token stores a `userId`, and the user behind
 * it may since have been deleted, so the id is resolved to a live user rather
 * than trusted.
 *
 * In this deployment better-auth's MongoDB adapter persists **no `id` field** —
 * the canonical user identifier is the hex string of `_id`, which is also what
 * appears in `session.userId` and in `SessionUser.id`. Querying `{ id }` here
 * would match nothing and silently make every token request a 401, so an
 * ObjectId-shaped id is resolved through `_id` and anything else falls back to
 * `id` for adapters that do write it.
 *
 * Same raw-driver caveat as `findUserByEmail`, and the same `id` guarantee —
 * this returns an `AuthUserWithId`, so a caller that reuses the result as a
 * membership key gets a real id rather than `undefined`.
 */
export async function findUserById(
  userId: string,
): Promise<AuthUserWithId | null> {
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 64) {
    return null;
  }

  const users = getAuthDb().collection<AuthUserRecord>("user");
  const user = OBJECT_ID_PATTERN.test(userId)
    ? await users.findOne({ _id: new ObjectId(userId) })
    : await users.findOne({ id: userId });

  return user ? withCanonicalId(user) : null;
}
