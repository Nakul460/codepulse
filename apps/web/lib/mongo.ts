import { MongoClient, type Db } from "mongodb";

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
  _id: { toString(): string };
  id?: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string;
}

export async function findUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  // This query bypasses Mongoose's casting, so it has no injection defence of
  // its own. Validate here rather than trusting every caller's schema — a
  // relaxed schema would otherwise allow {"email": {"$ne": null}}.
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return null;
  }

  const users = getAuthDb().collection<AuthUserRecord>("user");
  return users.findOne({ email: email.toLowerCase() });
}
