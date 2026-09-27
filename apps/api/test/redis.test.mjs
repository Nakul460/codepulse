import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionOptions } from "../dist/redis.js";

test("queue connections use the hosted Redis address, credentials, database, and TLS", () => {
  const previous = process.env.REDIS_URL;
  try {
    process.env.REDIS_URL = "rediss://queue-user:p%40ss%3Aword@redis.example.test:6380/2";
    assert.deepEqual(connectionOptions(), {
      host: "redis.example.test",
      port: 6380,
      username: "queue-user",
      password: "p@ss:word",
      db: 2,
      tls: {},
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    process.env.REDIS_URL = "redis://[::1]";
    const local = connectionOptions();
    assert.equal(local.host, "::1");
    assert.equal(local.port, 6379);
    assert.equal(local.db, 0);
    assert.equal(local.tls, undefined);
    process.env.REDIS_URL = "https://redis.example.test";
    assert.throws(connectionOptions, /must use redis/);
    process.env.REDIS_URL = "redis://redis.example.test/not-a-db";
    assert.throws(connectionOptions, /non-negative integer/);
  } finally {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  }
});
