import mongoose, { Schema } from "mongoose";
import { loadRootEnv, requireEnv } from "./env.js";

/**
 * The API service's own connection, separate from the web app's. Both point at
 * PROJECT_DATABASE_URL but hold independent pools, which is what lets the worker
 * and the web app scale separately.
 */

const globalForApi = globalThis as unknown as { apiMongoose?: typeof mongoose };

export const apiMongoose = globalForApi.apiMongoose ?? mongoose;

if (process.env.NODE_ENV !== "production") {
  globalForApi.apiMongoose = apiMongoose;
}

export async function connect() {
  loadRootEnv();

  if (apiMongoose.connection.readyState >= 1) {
    return apiMongoose.connection;
  }

  return apiMongoose.connect(requireEnv("PROJECT_DATABASE_URL"));
}

/**
 * One row per webhook delivery, used to make processing idempotent.
 *
 * GitHub retries any delivery that does not answer 2xx, and it also redelivers
 * on a manual "Redeliver". The unique index on `deliveryId` is what actually
 * enforces at-most-once: a duplicate insert throws, and that is how the
 * receiver recognises a replay.
 *
 * The TTL index is deliberate — this table is a dedupe ledger, not history, and
 * GitHub does not redeliver beyond a few days.
 */
const deliverySchema = new Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    correlationId: { type: String, default: null, index: true },
    event: { type: String, required: true },
    installationId: { type: String, default: null },
    repositoryFullName: { type: String, default: null },
    status: {
      type: String,
      enum: ["queued", "processing", "processed", "ignored", "failed"],
      default: "queued",
      index: true,
    },
    processedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

deliverySchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const deliveryModel =
  mongoose.models.WebhookDelivery ??
  mongoose.model("WebhookDelivery", deliverySchema);

const githubCommitSchema = new Schema(
  {
    githubId: { type: String, required: true },
    repositoryId: { type: Number, required: true, index: true },
    repositoryFullName: { type: String, required: true, lowercase: true },
    message: { type: String, required: true, default: "" },
    authorName: { type: String, default: "" },
    authorEmail: { type: String, default: "" },
    authorUsername: { type: String, default: "" },
    committedAt: { type: Date, default: null },
    url: { type: String, default: "" },
    ref: { type: String, default: "" },
    added: { type: [String], default: [] },
    removed: { type: [String], default: [] },
    modified: { type: [String], default: [] },
    deliveryId: { type: String, required: true },
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);
githubCommitSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
githubCommitSchema.index({ repositoryId: 1, committedAt: -1 });

const githubPullRequestSchema = new Schema(
  {
    githubId: { type: Number, required: true },
    repositoryId: { type: Number, required: true, index: true },
    repositoryFullName: { type: String, required: true, lowercase: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, default: "" },
    body: { type: String, default: "" },
    state: { type: String, enum: ["open", "closed"], required: true },
    merged: { type: Boolean, default: false },
    draft: { type: Boolean, default: false },
    authorUsername: { type: String, default: "" },
    baseBranch: { type: String, default: "" },
    headBranch: { type: String, default: "" },
    htmlUrl: { type: String, default: "" },
    createdAtGithub: { type: Date, default: null },
    updatedAtGithub: { type: Date, default: null },
    closedAtGithub: { type: Date, default: null },
    mergedAtGithub: { type: Date, default: null },
    action: { type: String, default: "" },
    deliveryId: { type: String, required: true },
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);
githubPullRequestSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
githubPullRequestSchema.index({ repositoryId: 1, number: 1 }, { unique: true });

const githubIssueSchema = new Schema(
  {
    githubId: { type: Number, required: true },
    repositoryId: { type: Number, required: true, index: true },
    repositoryFullName: { type: String, required: true, lowercase: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, default: "" },
    body: { type: String, default: "" },
    state: { type: String, enum: ["open", "closed"], required: true },
    authorUsername: { type: String, default: "" },
    assignees: { type: [String], default: [] },
    labels: { type: [String], default: [] },
    htmlUrl: { type: String, default: "" },
    createdAtGithub: { type: Date, default: null },
    updatedAtGithub: { type: Date, default: null },
    closedAtGithub: { type: Date, default: null },
    action: { type: String, default: "" },
    deliveryId: { type: String, required: true },
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);
githubIssueSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
githubIssueSchema.index({ repositoryId: 1, number: 1 }, { unique: true });

const githubBranchSchema = new Schema({
  repositoryId: { type: Number, required: true, index: true },
  repositoryFullName: { type: String, required: true, lowercase: true },
  name: { type: String, required: true },
  sha: { type: String, required: true },
  protected: { type: Boolean, default: false },
  htmlUrl: { type: String, default: "" },
  correlationId: { type: String, required: true },
}, { timestamps: true });
githubBranchSchema.index({ repositoryId: 1, name: 1 }, { unique: true });

const githubDeploymentSchema = new Schema({
  repositoryId: { type: Number, required: true, index: true },
  repositoryFullName: { type: String, required: true, lowercase: true },
  githubId: { type: Number, required: true },
  sha: { type: String, default: "" },
  ref: { type: String, default: "" },
  task: { type: String, default: "" },
  environment: { type: String, default: "" },
  originalEnvironment: { type: String, default: "" },
  description: { type: String, default: "" },
  creatorUsername: { type: String, default: "" },
  state: { type: String, default: "pending" },
  environmentUrl: { type: String, default: "" },
  logUrl: { type: String, default: "" },
  createdAtGithub: { type: Date, default: null },
  updatedAtGithub: { type: Date, default: null },
  deliveryId: { type: String, default: "" },
  correlationId: { type: String, required: true },
}, { timestamps: true });
githubDeploymentSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
githubDeploymentSchema.index({ repositoryId: 1, createdAtGithub: -1 });

export const githubCommitModel =
  mongoose.models.GithubCommit ?? mongoose.model("GithubCommit", githubCommitSchema);
export const githubPullRequestModel =
  mongoose.models.GithubPullRequest ??
  mongoose.model("GithubPullRequest", githubPullRequestSchema);
export const githubIssueModel =
  mongoose.models.GithubIssue ?? mongoose.model("GithubIssue", githubIssueSchema);
export const githubBranchModel = mongoose.models.GithubBranch ?? mongoose.model("GithubBranch", githubBranchSchema);
export const githubDeploymentModel = mongoose.models.GithubDeployment ?? mongoose.model("GithubDeployment", githubDeploymentSchema);

const repositorySchema = new Schema(
  {
    githubId: { type: Number, required: true },
    installationId: { type: String, required: true },
    lastSyncedAt: { type: Date, default: null },
  },
  { collection: "repositories", strict: false },
);

export const repositoryModel =
  mongoose.models.Repository ?? mongoose.model("Repository", repositorySchema);

const repositorySyncStateSchema = new Schema(
  {
    repositoryId: { type: Schema.Types.ObjectId, required: true, unique: true },
    status: { type: String, enum: ["queued", "running", "complete", "partial", "failed"], required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    counts: {
      commits: { type: Number, default: 0 },
      pullRequests: { type: Number, default: 0 },
      issues: { type: Number, default: 0 },
    },
    truncated: { type: Boolean, default: false },
    correlationId: { type: String, default: null },
  },
  { timestamps: true, collection: "repository_sync_states" },
);

export const repositorySyncStateModel =
  mongoose.models.RepositorySyncState ??
  mongoose.model("RepositorySyncState", repositorySyncStateSchema);
