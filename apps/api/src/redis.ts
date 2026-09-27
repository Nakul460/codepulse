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
  return { maxRetriesPerRequest: null, enableReadyCheck: false };
}

export function createRedis(): Redis {
  return new Redis(redisUrl(), connectionOptions());
}
