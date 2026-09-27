import mongoose from "mongoose";

// Next.js hot-reloads route modules in dev, which would otherwise open a new
// pool on every edit until Mongo refuses connections.
const globalForMongoose = globalThis as unknown as {
  mongooseConnection?: typeof mongoose;
};

export const mongooseConnection =
  globalForMongoose.mongooseConnection ?? mongoose;

if (process.env.NODE_ENV !== "production") {
  globalForMongoose.mongooseConnection = mongooseConnection;
}

export async function connectProjectDB() {
  const dbUrl = process.env.PROJECT_DATABASE_URL;

  if (!dbUrl) {
    throw new Error("PROJECT_DATABASE_URL is not set");
  }

  if (mongooseConnection.connection.readyState >= 1) {
    return mongooseConnection.connection;
  }

  return mongooseConnection.connect(dbUrl);
}
