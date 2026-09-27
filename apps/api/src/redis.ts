import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import { loadRootEnv, requireEnv } from "./env.js";

/**
 * Queue wiring.
 *
 * The HTTP receiver and the worker are separate processes sharing Redis, which
 * is the whole point: a slow or crashing handler must never block GitHub's
 * request, and GitHub gives an installation only ~10s before it starts
 * retrying.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on any client it hands to
 * ioredis, otherwise a blocking command fails instead of waiting.
 */

export function redisUrl(): string {
  loadRootEnv();
  return requireEnv("REDIS_URL");
}

export function connectionOptions(): RedisOptions {
  const url = new URL(redisUrl());
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  const db = url.pathname.slice(1);
  if (db && !/^\d+$/.test(db)) {
    throw new Error("REDIS_URL database must be a non-negative integer");
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: db ? Number(db) : 0,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function createRedis(): Redis {
  return new Redis(connectionOptions());
}
