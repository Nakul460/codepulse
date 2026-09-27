/**
 * The GitHub webhook contract. Both the receiver and the worker import these
 * from one place so a payload change cannot be half-applied.
 *
 * GitHub sends a delivery id in the `X-GitHub-Delivery` header and repeats
 * deliveries on any non-2xx, so `deliveryId` is what makes processing
 * idempotent. See apps/api/src/ingest/delivery.ts.
 */

export const GITHUB_WEBHOOK_EVENTS = [
  "push",
  "pull_request",
  "pull_request_review",
  "issues",
  "issue_comment",
  "deployment",
  "deployment_status",
  "create",
  "delete",
  "check_run",
  "check_suite",
  "ping",
] as const;

export type GitHubWebhookEvent = (typeof GITHUB_WEBHOOK_EVENTS)[number];

/** The subset of GitHub's payload the receiver needs to route a delivery. */
export interface WebhookEnvelope {
  /** Server-generated id used to follow this delivery through the queue. */
  correlationId: string;
  deliveryId: string;
  event: GitHubWebhookEvent;
  /** GitHub's own installation id, from the payload or the header. */
  installationId: string | null;
  repositoryId: number | null;
  /** `owner/name`, lowercased, when GitHub sent one. */
  fullName: string | null;
  /** Everything else, passed through to the worker untouched. */
  payload: Record<string, unknown>;
}

export const INGEST_QUEUES = {
  /** Fire-and-forget handlers: dedupe on delivery id, no retries beyond BullMQ's. */
  webhooks: "github-webhooks",
  /** Slower reconciliation: backfills, nightly repo metadata refresh. */
  sync: "repository-sync",
} as const;

export type QueueName = (typeof INGEST_QUEUES)[keyof typeof INGEST_QUEUES];

export interface WebhookJobData extends WebhookEnvelope {
  /** How many times this delivery has been attempted, for poison-message logic. */
  attempt?: number;
}

export interface RepositorySyncJobData {
  /** Mongo document id of the connected repository. */
  repositoryId: string;
  fullName: string;
  installationId: string;
  reason: "initial" | "manual" | "scheduled" | "webhook-triggered";
  correlationId: string;
}
