import { Worker, type Job } from "bullmq";
import {
  INGEST_QUEUES,
  type RepositorySyncJobData,
  type WebhookEnvelope,
  type WebhookJobData,
} from "@codepulse/shared";
import { apiMongoose, connect } from "./db.js";
import { loadRootEnv } from "./env.js";
import { connectionOptions } from "./redis.js";
import { processWebhook } from "./ingest/process.js";
import { enqueueDueRepositorySyncs, syncRepository } from "./ingest/sync.js";

/**
 * The ingest worker normalizes supported GitHub events into idempotent Mongo
 * upserts. Events without a handler are explicitly marked ignored.
 */

loadRootEnv();

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const syncConcurrency = Number(process.env.WORKER_SYNC_CONCURRENCY ?? 2);
const DEFAULT_DISCOVERY_INTERVAL_MS = 5 * 60 * 1000;
const configuredDiscoveryInterval = Number(process.env.WORKER_SYNC_DISCOVERY_MS);
const discoveryIntervalMs =
  Number.isSafeInteger(configuredDiscoveryInterval) && configuredDiscoveryInterval > 0
    ? configuredDiscoveryInterval
    : DEFAULT_DISCOVERY_INTERVAL_MS;
let syncDiscoveryTimer: NodeJS.Timeout | undefined;

async function handleDelivery(job: Job<WebhookJobData>) {
  const envelope = job.data as WebhookEnvelope;
  console.log(
    `[worker] processing delivery ${envelope.deliveryId} (${envelope.event}) [${envelope.correlationId}]`,
  );
  await processWebhook(envelope);
}

async function main() {
  await connect();

  const worker = new Worker<WebhookJobData>(
    INGEST_QUEUES.webhooks,
    handleDelivery,
    { connection: connectionOptions(), concurrency },
  );
  const syncWorker = new Worker<RepositorySyncJobData>(
    INGEST_QUEUES.sync,
    async (job) => {
      console.log(
        `[worker] syncing repository ${job.data.fullName} (${job.data.reason}) [${job.data.correlationId}]`,
      );
      const result = await syncRepository(job.data);
      console.log(
        `[worker] synced ${job.data.fullName}: ${result.commits} commits, ${result.pullRequests} pull requests, ${result.issues} issues, ${result.branches} branches, ${result.deployments} deployments${result.truncated ? " (page limit reached)" : ""}`,
      );
      return result;
    },
    { connection: connectionOptions(), concurrency: syncConcurrency },
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[worker] delivery ${job?.id ?? "?"} [${job?.data.correlationId ?? "?"}] failed on attempt ${job?.attemptsMade ?? "?"}:`,
      error.message,
    );
  });

  worker.on("error", (error) => {
    console.error("[worker] error:", error.message);
  });
  syncWorker.on("failed", (job, error) => {
    console.error(
      `[worker] repository sync ${job?.data.repositoryId ?? "?"} [${job?.data.correlationId ?? "?"}] failed on attempt ${job?.attemptsMade ?? "?"}:`,
      error.message,
    );
  });
  syncWorker.on("error", (error) => {
    console.error("[worker] sync error:", error.message);
  });

  console.log(`[worker] listening on ${INGEST_QUEUES.webhooks} (concurrency ${concurrency})`);
  console.log(`[worker] listening on ${INGEST_QUEUES.sync} (concurrency ${syncConcurrency})`);

  const scheduleDueRepositories = async () => {
    try {
      const count = await enqueueDueRepositorySyncs();
      if (count > 0) console.log(`[worker] scheduled ${count} repository sync(s)`);
    } catch (error) {
      console.error(
        "[worker] repository sync discovery failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  await scheduleDueRepositories();
  syncDiscoveryTimer = setInterval(() => void scheduleDueRepositories(), discoveryIntervalMs);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      console.log(`[worker] ${signal} received, draining`);
      if (syncDiscoveryTimer) clearInterval(syncDiscoveryTimer);
      await Promise.all([worker.close(), syncWorker.close()]);
      await apiMongoose.connection.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
