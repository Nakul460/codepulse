import { Queue } from "bullmq";
import {
  INGEST_QUEUES,
  type QueueName,
  type RepositorySyncJobData,
  type WebhookJobData,
} from "@codepulse/shared";
import { connectionOptions } from "./redis.js";

/**
 * Queue factories. Queues are created per process and torn down on shutdown;
 * BullMQ's own connection is shared via `connectionOptions()` rather than a
 * duplicated ioredis instance.
 */

export function webhookQueue() {
  return new Queue<WebhookJobData>(INGEST_QUEUES.webhooks, {
    connection: connectionOptions(),
  });
}

export function repositorySyncQueue() {
  return new Queue<RepositorySyncJobData>(INGEST_QUEUES.sync, {
    connection: connectionOptions(),
  });
}

export async function enqueueRepositorySync(data: RepositorySyncJobData) {
  return enqueueRepositorySyncBatch([data]);
}

export async function enqueueRepositorySyncBatch(data: RepositorySyncJobData[]) {
  if (data.length === 0) return [];
  const queue = repositorySyncQueue();
  try {
    return await Promise.all(data.map(async (repository) => {
      const jobId = `repository-sync-${repository.repositoryId}`;
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (["waiting", "active", "delayed", "waiting-children"].includes(state)) return existing;
        await existing.remove();
      }
      return queue.add("sync", repository, {
          // A repository can have only one pending/running sync. Completed jobs
          // are removed so a later webhook or scheduled run can reconcile it.
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        });
    }));
  } finally {
    await queue.close();
  }
}

export const QUEUE_NAMES = Object.values(INGEST_QUEUES) as QueueName[];
