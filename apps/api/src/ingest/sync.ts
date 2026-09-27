import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { RepositorySyncJobData } from "@codepulse/shared";
import {
  githubCommitModel,
  githubBranchModel,
  githubDeploymentModel,
  githubIssueModel,
  githubPullRequestModel,
  repositoryModel,
  repositorySyncStateModel,
} from "../db.js";
import { listDeploymentStatuses, listRepositoryPages } from "../github/client.js";
import { enqueueRepositorySyncBatch } from "../queue.js";

type GitHubRecord = Record<string, unknown>;

const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILED_SYNC_RETRY_MS = 60 * 60 * 1000;

/** Find newly connected and stale repositories and schedule a reconciliation. */
export async function enqueueDueRepositorySyncs() {
  const configuredSyncInterval = Number(process.env.REPOSITORY_SYNC_INTERVAL_MS);
  const syncIntervalMs = Number.isSafeInteger(configuredSyncInterval) && configuredSyncInterval > 0
    ? configuredSyncInterval
    : DEFAULT_SYNC_INTERVAL_MS;
  const now = Date.now();
  const dueBefore = new Date(now - syncIntervalMs);
  const failedRetryBefore = new Date(now - FAILED_SYNC_RETRY_MS);
  const repositories = await repositoryModel
    .find({ installationId: { $type: "string" } })
    .select("_id installationId fullName lastSyncedAt")
    .lean();

  if (repositories.length === 0) return 0;

  const ids = repositories.map((repository) => repository._id);
  const states = await repositorySyncStateModel
    .find({ repositoryId: { $in: ids } })
    .select("repositoryId status updatedAt")
    .lean();
  const stateByRepository = new Map(
    states.map((state) => [String(state.repositoryId), state]),
  );

  const due = repositories.flatMap((repository) => {
    const state = stateByRepository.get(String(repository._id));
    const lastSyncedAt = repository.lastSyncedAt
      ? new Date(repository.lastSyncedAt).getTime()
      : 0;
    if (lastSyncedAt && lastSyncedAt > dueBefore.getTime()) return [];
    if (state?.status === "running" || state?.status === "partial") return [];
    if (
      state?.status === "failed" &&
      state.updatedAt &&
      new Date(state.updatedAt).getTime() > failedRetryBefore.getTime()
    ) {
      return [];
    }

    const installationId = String(repository.installationId ?? "");
    const fullName = String(repository.fullName ?? "");
    if (!installationId || !fullName) return [];
    return [{
      repositoryId: String(repository._id),
      fullName,
      installationId,
      reason: lastSyncedAt ? "scheduled" as const : "initial" as const,
      correlationId: randomUUID(),
    }];
  });

  await enqueueRepositorySyncBatch(due);
  return due.length;
}

function record(value: unknown): GitHubRecord {
  return typeof value === "object" && value !== null
    ? (value as GitHubRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function date(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function labels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = record(item).name;
    return typeof name === "string" ? [name] : [];
  });
}

function assignees(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const login = record(item).login;
    return typeof login === "string" ? [login] : [];
  });
}

async function saveCommits(
  records: GitHubRecord[],
  githubRepositoryId: number,
  fullName: string,
  correlationId: string,
) {
  const operations = records.flatMap((commit) => {
    const sha = text(commit.sha);
    if (!sha) return [];
    const commitData = record(commit.commit);
    const author = record(commit.author);
    const commitAuthor = record(commitData.author);
    const committer = record(commitData.committer);
    return [{
      updateOne: {
        filter: { repositoryId: githubRepositoryId, githubId: sha },
        update: {
          $set: {
            repositoryId: githubRepositoryId,
            repositoryFullName: fullName,
            message: text(commitData.message),
            authorName: text(commitAuthor.name),
            authorEmail: text(commitAuthor.email),
            authorUsername: text(author.login),
            committedAt: date(commitAuthor.date) ?? date(committer.date),
            url: text(commit.html_url),
            deliveryId: `repository-sync:${githubRepositoryId}`,
            correlationId,
          },
        },
        upsert: true,
      },
    }];
  });
  if (operations.length) await githubCommitModel.bulkWrite(operations, { ordered: false });
  return operations.length;
}

async function savePullRequests(
  records: GitHubRecord[],
  githubRepositoryId: number,
  fullName: string,
  correlationId: string,
) {
  const operations = records.flatMap((pr) => {
    const githubId = Number(pr.id);
    const number = Number(pr.number);
    if (!Number.isFinite(githubId) || !Number.isFinite(number)) return [];
    const base = record(pr.base);
    const head = record(pr.head);
    return [{
      updateOne: {
        filter: { repositoryId: githubRepositoryId, githubId },
        update: {
          $set: {
            repositoryFullName: fullName,
            number,
            title: text(pr.title),
            body: text(pr.body),
            state: pr.state === "closed" ? "closed" : "open",
            merged: Boolean(pr.merged_at),
            draft: Boolean(pr.draft),
            authorUsername: text(record(pr.user).login),
            baseBranch: text(base.ref),
            headBranch: text(head.ref),
            htmlUrl: text(pr.html_url),
            createdAtGithub: date(pr.created_at),
            updatedAtGithub: date(pr.updated_at),
            closedAtGithub: date(pr.closed_at),
            mergedAtGithub: date(pr.merged_at),
            action: "repository-sync",
            deliveryId: `repository-sync:${githubRepositoryId}`,
            correlationId,
          },
        },
        upsert: true,
      },
    }];
  });
  if (operations.length) await githubPullRequestModel.bulkWrite(operations, { ordered: false });
  return operations.length;
}

async function saveIssues(
  records: GitHubRecord[],
  githubRepositoryId: number,
  fullName: string,
  correlationId: string,
) {
  const operations = records.flatMap((issue) => {
    const githubId = Number(issue.id);
    const number = Number(issue.number);
    // The REST issues endpoint includes pull requests; they have their own
    // canonical collection and are fetched from /pulls.
    if (!Number.isFinite(githubId) || !Number.isFinite(number) || issue.pull_request) return [];
    return [{
      updateOne: {
        filter: { repositoryId: githubRepositoryId, githubId },
        update: {
          $set: {
            repositoryFullName: fullName,
            number,
            title: text(issue.title),
            body: text(issue.body),
            state: issue.state === "closed" ? "closed" : "open",
            authorUsername: text(record(issue.user).login),
            assignees: assignees(issue.assignees),
            labels: labels(issue.labels),
            htmlUrl: text(issue.html_url),
            createdAtGithub: date(issue.created_at),
            updatedAtGithub: date(issue.updated_at),
            closedAtGithub: date(issue.closed_at),
            action: "repository-sync",
            deliveryId: `repository-sync:${githubRepositoryId}`,
            correlationId,
          },
        },
        upsert: true,
      },
    }];
  });
  if (operations.length) await githubIssueModel.bulkWrite(operations, { ordered: false });
  return operations.length;
}

async function saveBranches(records: GitHubRecord[], githubRepositoryId: number, fullName: string, correlationId: string, truncated: boolean) {
  const operations = records.flatMap((branch) => {
    const name = text(branch.name);
    const sha = text(record(branch.commit).sha);
    if (!name || !sha) return [];
    return [{ updateOne: { filter: { repositoryId: githubRepositoryId, name }, update: { $set: {
      repositoryFullName: fullName, name, sha, protected: Boolean(branch.protected),
      htmlUrl: `https://github.com/${fullName}/tree/${name.split("/").map(encodeURIComponent).join("/")}`,
      correlationId,
    } }, upsert: true } }];
  });
  if (operations.length) await githubBranchModel.bulkWrite(operations, { ordered: false });
  if (!truncated) {
    await githubBranchModel.deleteMany({ repositoryId: githubRepositoryId, name: { $nin: operations.map((operation) => operation.updateOne.filter.name) } });
  }
  return operations.length;
}

async function saveDeployments(records: GitHubRecord[], githubRepositoryId: number, fullName: string, installationId: string, correlationId: string) {
  const operations = records.flatMap((deployment) => {
    const githubId = Number(deployment.id);
    if (!Number.isFinite(githubId)) return [];
    return [{ updateOne: { filter: { repositoryId: githubRepositoryId, githubId }, update: { $set: {
      repositoryFullName: fullName, githubId, sha: text(deployment.sha), ref: text(deployment.ref),
      task: text(deployment.task), environment: text(deployment.environment),
      originalEnvironment: text(deployment.original_environment), description: text(deployment.description),
      creatorUsername: text(record(deployment.creator).login), createdAtGithub: date(deployment.created_at),
      correlationId,
    }, $setOnInsert: { state: "pending" } }, upsert: true } }];
  });
  if (operations.length) await githubDeploymentModel.bulkWrite(operations, { ordered: false });

  // Fetch the current status of a bounded recent window. Status events keep
  // older rows current after this initial backfill without an unbounded fanout.
  const statusWindow = records.slice(0, 50);
  for (let index = 0; index < statusWindow.length; index += 5) {
    await Promise.all(statusWindow.slice(index, index + 5).map(async (deployment) => {
      const githubId = Number(deployment.id);
      if (!Number.isFinite(githubId)) return;
      const status = await listDeploymentStatuses<GitHubRecord>(installationId, fullName, githubId);
      if (!status) return;
      await githubDeploymentModel.updateOne({ repositoryId: githubRepositoryId, githubId }, { $set: {
        state: text(status.state) || "pending", environmentUrl: text(status.environment_url),
        logUrl: text(status.log_url), updatedAtGithub: date(status.updated_at) ?? date(status.created_at),
      } });
    }));
  }
  return operations.length;
}

export async function syncRepository(job: RepositorySyncJobData) {
  const repositoryObjectId = new mongoose.Types.ObjectId(job.repositoryId);
  const repository = await repositoryModel.findById(repositoryObjectId).lean();
  if (!repository) throw new Error("Connected repository no longer exists");
  if (String(repository.installationId) !== job.installationId) {
    throw new Error("Repository installation changed before sync started");
  }

  const githubRepositoryId = Number(repository.githubId);
  const fullName = String(repository.fullName || job.fullName).toLowerCase();
  await repositorySyncStateModel.updateOne(
    { repositoryId: repositoryObjectId },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
        completedAt: null,
        lastError: null,
        counts: { commits: 0, pullRequests: 0, issues: 0, branches: 0, deployments: 0 },
        truncated: false,
        correlationId: job.correlationId,
      },
    },
    { upsert: true },
  );

  try {
    const [commits, pullRequests, issues, branches, deployments] = await Promise.all([
      listRepositoryPages<GitHubRecord>(job.installationId, fullName, "commits"),
      listRepositoryPages<GitHubRecord>(job.installationId, fullName, "pulls", "state=all&sort=updated&direction=desc"),
      listRepositoryPages<GitHubRecord>(job.installationId, fullName, "issues", "state=all&sort=updated&direction=desc"),
      listRepositoryPages<GitHubRecord>(job.installationId, fullName, "branches"),
      listRepositoryPages<GitHubRecord>(job.installationId, fullName, "deployments"),
    ]);

    const counts = {
      commits: await saveCommits(commits.items, githubRepositoryId, fullName, job.correlationId),
      pullRequests: await savePullRequests(pullRequests.items, githubRepositoryId, fullName, job.correlationId),
      issues: await saveIssues(issues.items, githubRepositoryId, fullName, job.correlationId),
      branches: await saveBranches(branches.items, githubRepositoryId, fullName, job.correlationId, branches.truncated),
      deployments: await saveDeployments(deployments.items, githubRepositoryId, fullName, job.installationId, job.correlationId),
    };
    const truncated = commits.truncated || pullRequests.truncated || issues.truncated || branches.truncated || deployments.truncated;

    await repositorySyncStateModel.updateOne(
      { repositoryId: repositoryObjectId },
      {
        $set: {
          status: truncated ? "partial" : "complete",
          completedAt: new Date(),
          counts,
          truncated,
          lastError: null,
        },
      },
    );

    if (!truncated) {
      await repositoryModel.updateOne(
        { _id: repositoryObjectId },
        { $set: { lastSyncedAt: new Date() } },
      );
    }

    return { ...counts, truncated };
  } catch (error) {
    await repositorySyncStateModel.updateOne(
      { repositoryId: repositoryObjectId },
      {
        $set: {
          status: "failed",
          completedAt: new Date(),
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        },
      },
    );
    throw error;
  }
}
