import type { WebhookEnvelope } from "@codepulse/shared";
import {
  deliveryModel,
  githubCommitModel,
  githubBranchModel,
  githubDeploymentModel,
  githubIssueModel,
  githubPullRequestModel,
  repositoryModel,
} from "../db.js";
import { enqueueRepositorySync } from "../queue.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function names(values: unknown): string[] {
  return Array.isArray(values)
    ? values.flatMap((value) => {
        const entry = object(value);
        return entry && typeof entry.name === "string" ? [entry.name] : [];
      })
    : [];
}

function username(value: unknown) {
  return string(object(value)?.login);
}

async function ingestPush(envelope: WebhookEnvelope) {
  const repositoryId = envelope.repositoryId;
  const fullName = envelope.fullName;
  if (repositoryId === null || !fullName) return;

  const commits = envelope.payload.commits;
  if (!Array.isArray(commits) || commits.length === 0) return;

  const ref = string(envelope.payload.ref);
  const pushedAt = date(envelope.payload.pushed_at);
  const pusher = object(envelope.payload.pusher);

  const operations = commits.flatMap((raw) => {
    const commit = object(raw);
    const sha = string(commit?.id);
    if (!commit || !sha) return [];

    const author = object(commit.author);
    const commitData = object(commit.commit);
    const authorData = object(commitData?.author);
    return [{
      updateOne: {
        filter: { repositoryId, githubId: sha },
        update: {
          $set: {
            repositoryFullName: fullName,
            message: string(commit.message),
            authorName: string(author?.name, string(authorData?.name)),
            authorEmail: string(author?.email, string(authorData?.email)),
            authorUsername: string(author?.username, string(pusher?.name)),
            committedAt: date(authorData?.date) ?? pushedAt,
            url: string(commit.url),
            added: Array.isArray(commit.added) ? commit.added.filter((x): x is string => typeof x === "string") : [],
            removed: Array.isArray(commit.removed) ? commit.removed.filter((x): x is string => typeof x === "string") : [],
            modified: Array.isArray(commit.modified) ? commit.modified.filter((x): x is string => typeof x === "string") : [],
            ref,
            deliveryId: envelope.deliveryId,
            correlationId: envelope.correlationId,
          },
          $setOnInsert: { repositoryId },
        },
        upsert: true,
      },
    }];
  });

  if (operations.length > 0) {
    await githubCommitModel.bulkWrite(operations, { ordered: false });
  }
}

async function ingestPullRequest(envelope: WebhookEnvelope) {
  const repositoryId = envelope.repositoryId;
  const fullName = envelope.fullName;
  const pr = object(envelope.payload.pull_request);
  if (repositoryId === null || !fullName || !pr) return;

  const githubId = number(pr.id);
  const numberValue = number(pr.number);
  if (githubId === null || numberValue === null) return;

  const base = object(pr.base);
  const head = object(pr.head);
  const user = object(pr.user);
  await githubPullRequestModel.updateOne(
    { repositoryId, githubId },
    {
      $set: {
        repositoryFullName: fullName,
        number: numberValue,
        title: string(pr.title),
        body: string(pr.body),
        state: pr.state === "closed" ? "closed" : "open",
        merged: Boolean(pr.merged),
        draft: Boolean(pr.draft),
        authorUsername: string(user?.login),
        baseBranch: string(base?.ref),
        headBranch: string(head?.ref),
        htmlUrl: string(pr.html_url),
        createdAtGithub: date(pr.created_at),
        updatedAtGithub: date(pr.updated_at),
        closedAtGithub: date(pr.closed_at),
        mergedAtGithub: date(pr.merged_at),
        action: string(envelope.payload.action),
        deliveryId: envelope.deliveryId,
        correlationId: envelope.correlationId,
      },
    },
    { upsert: true },
  );
}

async function ingestIssue(envelope: WebhookEnvelope) {
  const repositoryId = envelope.repositoryId;
  const fullName = envelope.fullName;
  const issue = object(envelope.payload.issue);
  // Pull requests are also represented as GitHub issues. Their canonical row
  // is stored by pull_request events, so don't create a duplicate issue row.
  if (repositoryId === null || !fullName || !issue || issue.pull_request) return;

  const githubId = number(issue.id);
  const numberValue = number(issue.number);
  if (githubId === null || numberValue === null) return;

  const user = object(issue.user);
  await githubIssueModel.updateOne(
    { repositoryId, githubId },
    {
      $set: {
        repositoryFullName: fullName,
        number: numberValue,
        title: string(issue.title),
        body: string(issue.body),
        state: issue.state === "closed" ? "closed" : "open",
        authorUsername: string(user?.login),
        assignees: Array.isArray(issue.assignees)
          ? issue.assignees.map(username).filter(Boolean)
          : [],
        labels: names(issue.labels),
        htmlUrl: string(issue.html_url),
        createdAtGithub: date(issue.created_at),
        updatedAtGithub: date(issue.updated_at),
        closedAtGithub: date(issue.closed_at),
        action: string(envelope.payload.action),
        deliveryId: envelope.deliveryId,
        correlationId: envelope.correlationId,
      },
    },
    { upsert: true },
  );
}

async function ingestBranchEvent(envelope: WebhookEnvelope) {
  const { payload, repositoryId, fullName } = envelope;
  if (repositoryId === null || !fullName || payload.ref_type !== "branch") return;
  const name = string(payload.ref);
  if (!name) return;
  if (envelope.event === "delete") {
    await githubBranchModel.deleteOne({ repositoryId, name });
  }
  // Branch creation is reconciled by the bounded branch list in the queued
  // repository sync, which supplies the canonical commit SHA and protection.
}

async function ingestDeployment(envelope: WebhookEnvelope) {
  const { payload, repositoryId, fullName } = envelope;
  const deployment = object(payload.deployment);
  if (repositoryId === null || !fullName || !deployment) return;
  const githubId = number(deployment.id);
  if (githubId === null) return;
  const status = object(payload.deployment_status);
  const creator = object(deployment.creator);
  const statusCreator = object(status?.creator);
  await githubDeploymentModel.updateOne(
    { repositoryId, githubId },
    {
      $set: {
        repositoryFullName: fullName,
        sha: string(deployment.sha),
        ref: string(deployment.ref),
        task: string(deployment.task),
        environment: string(deployment.environment),
        originalEnvironment: string(deployment.original_environment),
        description: string(deployment.description),
        creatorUsername: string(statusCreator?.login, string(creator?.login)),
        createdAtGithub: date(deployment.created_at),
        ...(status ? {
          state: string(status.state, "pending"),
          environmentUrl: string(status.environment_url),
          logUrl: string(status.log_url),
          updatedAtGithub: date(status.updated_at) ?? date(status.created_at),
        } : {
          updatedAtGithub: date(deployment.updated_at),
        }),
        deliveryId: envelope.deliveryId,
        correlationId: envelope.correlationId,
      },
      $setOnInsert: { state: "pending" },
    },
    { upsert: true },
  );
}

/** Persist one supported GitHub delivery. Every write is safe to retry. */
export async function processWebhook(envelope: WebhookEnvelope) {
  const delivery = { deliveryId: envelope.deliveryId };
  await deliveryModel.updateOne(delivery, {
    $set: { status: "processing", correlationId: envelope.correlationId, lastError: null },
  });

  try {
    const repository =
      envelope.repositoryId !== null && envelope.installationId
        ? await repositoryModel.findOne({
            githubId: envelope.repositoryId,
            installationId: envelope.installationId,
          })
        : null;

    if (!repository) {
      await deliveryModel.updateOne(delivery, {
        $set: { status: "ignored", processedAt: new Date(), lastError: null },
      });
      return;
    }

    if (!envelope.fullName) {
      await deliveryModel.updateOne(delivery, {
        $set: { status: "ignored", processedAt: new Date(), lastError: null },
      });
      return;
    }

    switch (envelope.event) {
      case "push":
        await ingestPush(envelope);
        break;
      case "pull_request":
        await ingestPullRequest(envelope);
        break;
      case "issues":
        await ingestIssue(envelope);
        break;
      case "create":
      case "delete":
        await ingestBranchEvent(envelope);
        break;
      case "deployment":
      case "deployment_status":
        await ingestDeployment(envelope);
        break;
      default:
        await deliveryModel.updateOne(delivery, {
          $set: { status: "ignored", processedAt: new Date() },
        });
        return;
    }

    await enqueueRepositorySync({
      repositoryId: String(repository._id),
      fullName: envelope.fullName,
      installationId: String(repository.installationId),
      reason: "webhook-triggered",
      correlationId: envelope.correlationId,
    });

    await deliveryModel.updateOne(delivery, {
      $set: { status: "processed", processedAt: new Date(), lastError: null },
    });
  } catch (error) {
    await deliveryModel.updateOne(delivery, {
      $set: {
        status: "failed",
        lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
      },
    });
    throw error;
  }
}
