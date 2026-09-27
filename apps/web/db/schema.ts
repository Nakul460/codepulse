import mongoose, { Schema } from "mongoose";
import { ACCESS_TOKEN_SCOPES } from "@codepulse/shared";
import {
  ACTIVITY_ACTIONS,
  MEMBER_ROLES,
  ORG_ROLES,
  PROJECT_STATUSES,
  type ActivityAction,
  type MemberRole,
  type OrgRole,
  type ProjectStatus,
} from "@/lib/project-status";

export {
  ACTIVITY_ACTIONS,
  MEMBER_ROLES,
  ORG_ROLES,
  PROJECT_STATUSES,
};
export type { ActivityAction, MemberRole, OrgRole, ProjectStatus };

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ createdBy: 1 });

const organizationMemberSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    role: { type: String, enum: ORG_ROLES, default: "member" },
  },
  { timestamps: true },
);

organizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);

/** Where an invitation is in its lifecycle. */
export const INVITATION_STATUSES = ["pending", "accepted", "declined"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * A pending invitation to join an organization.
 *
 * ## Why this exists instead of adding a member by email
 *
 * The previous flow looked the invitee up by email and wrote the membership
 * immediately. That is only safe if the address is proven to belong to the
 * person being added — otherwise whoever registered someone else's address
 * inherits that address's organization access the moment it is added. The old
 * code tried to guard this with an `emailVerified` check that is **skipped
 * entirely whenever no mail sender is configured**, i.e. exactly in the
 * deployments where the hole is widest.
 *
 * An invitation closes the hole structurally rather than conditionally: the
 * membership is only written after the invitee proves they control the mailbox
 * by following a token that was emailed to it. There is no configuration under
 * which that proof is optional.
 *
 * ## The token
 *
 * `tokenHash` is a SHA-256 of a 32-byte random token, and is the **only** copy
 * stored — same approach as a personal access token, so a database dump cannot
 * be replayed into a membership. The raw token exists only in the emailed link.
 * `select: false` keeps it out of ordinary queries.
 */
const organizationInvitationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ORG_ROLES, default: "member" },
    tokenHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: INVITATION_STATUSES,
      default: "pending",
      index: true,
    },
    // Recorded at accept time so the audit trail can name who actually joined,
    // which is not necessarily the address the invitation was sent to.
    acceptedByUserId: { type: String, default: "" },
    // Who sent it, for "invited by X" in the UI and for abuse investigation.
    invitedByUserId: { type: String, required: true },
    invitedByName: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/**
 * At most one *pending* invitation per (org, email).
 *
 * Re-inviting an address that already has a pending invitation replaces it —
 * new token, new expiry — rather than accumulating rows, and this index makes
 * that safe when two admins click "invite" at the same moment.
 *
 * `status` is deliberately **not** part of the key, because accepted and
 * declined rows are kept as history and a status-suffixed unique key would
 * reject the second acceptance of the same person to the same organization.
 * A partial index scopes the constraint to the only state that actually has to
 * be unique, which is what lets the collection keep history at the same time.
 *
 * This replaces the previous `{ organizationId, email, status }` unique index.
 * It has to be dropped explicitly on an existing deployment, because Mongo
 * keeps an index with the same key pattern even when the options change:
 *
 *   db.organizationinvitations.dropIndex("organizationId_1_email_1_status_1")
 */
organizationInvitationSchema.index(
  { organizationId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "one_pending_invitation_per_email",
  },
);

/** Serves `GET /api/invitations` (my pending invitations) without a scan. */
organizationInvitationSchema.index({ email: 1, status: 1 });

// Organization-level audit trail. Kept separate from ProjectActivity because
// these events (member added, role changed, org deleted) are not scoped to a
// project, and they are the events that matter most after an account takeover.
const organizationActivitySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

organizationActivitySchema.index({ organizationId: 1, createdAt: -1 });

const projectSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    projectName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: PROJECT_STATUSES, default: "ongoing" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    budget: { type: Number, default: 0, min: 0 },
    archivedAt: { type: Date, default: null, index: true },
    archivedBy: { type: String, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ organizationId: 1, archivedAt: 1 });

const projectMemberSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    // Only meaningful for users who are not already covered by their org role.
    role: { type: String, enum: MEMBER_ROLES, default: "viewer" },
  },
  { timestamps: true },
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

const projectActivitySchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    changes: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

projectActivitySchema.index({ projectId: 1, createdAt: -1 });
projectActivitySchema.index({ organizationId: 1, createdAt: -1 });

export const ISSUE_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const ISSUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const issueSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, default: "", maxlength: 20000 },
  status: { type: String, enum: ISSUE_STATUSES, default: "BACKLOG", index: true },
  priority: { type: String, enum: ISSUE_PRIORITIES, default: "MEDIUM", index: true },
  labels: { type: [String], default: [] },
  assigneeId: { type: String, default: null, index: true },
  dueDate: { type: Date, default: null },
  estimate: { type: Number, default: null, min: 0 },
  parentIssueId: { type: Schema.Types.ObjectId, ref: "Issue", default: null, index: true },
  relatedIssueIds: { type: [Schema.Types.ObjectId], ref: "Issue", default: [] },
  attachments: { type: [{ name: String, url: String, mimeType: String, size: Number, addedBy: String, addedAt: Date }], default: [] },
  archivedAt: { type: Date, default: null, index: true },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, required: true },
}, { timestamps: true });
issueSchema.index({ organizationId: 1, projectId: 1, archivedAt: 1, createdAt: -1 });
issueSchema.index({ projectId: 1, parentIssueId: 1 });

const issueCommentSchema = new Schema({
  issueId: { type: Schema.Types.ObjectId, ref: "Issue", required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  authorId: { type: String, required: true },
  authorName: { type: String, default: "" },
  body: { type: String, required: true, trim: true, maxlength: 10000 },
  mentions: { type: [String], default: [] },
}, { timestamps: true });
issueCommentSchema.index({ issueId:  1, createdAt: 1 });

const issueActivitySchema = new Schema({
  issueId: { type: Schema.Types.ObjectId, ref: "Issue", required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  actorId: { type: String, required: true },
  actorName: { type: String, default: "" },
  action: { type: String, required: true },
  changes: { type: [String], default: [] },
  metadata: { type: Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
issueActivitySchema.index({ issueId: 1, createdAt: -1 });

/**
 * A GitHub App installation, i.e. the thing an org installs the App on.
 *
 * This document deliberately holds no secret. GitHub issues installation
 * access tokens with a one-hour lifetime, so persisting one would leave a dead
 * credential in the database; they are minted on demand from the App private
 * key and cached in memory only. See lib/github.ts.
 */
const githubInstallationSchema = new Schema(
  {
    installationId: { type: String, required: true, unique: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    accountLogin: { type: String, required: true, lowercase: true, trim: true },
    // GitHub account type, not CodePulse's. Kept for display only — a personal
    // ("User") install is a legitimate small-team case and is not blocked.
    accountType: { type: String, enum: ["User", "Organization"], default: "Organization" },
    connectedBy: { type: String, required: true },
    connectedByName: { type: String, default: "" },
    suspendedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const repositorySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    // Plain string, not a ref to the installation document: webhooks and
    // background sync address installations by GitHub's own id.
    installationId: { type: String, required: true, index: true },
    githubId: { type: Number, required: true },
    owner: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, lowercase: true, trim: true },
    isPrivate: { type: Boolean, default: false },
    isFork: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    defaultBranch: { type: String, default: null },
    language: { type: String, default: null },
    htmlUrl: { type: String, required: true },
    connectedBy: { type: String, required: true },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// A repository full name is globally unique on GitHub, so this doubles as the
// guard against the same repo being attached to two CodePulse organizations.
repositorySchema.index({ owner: 1, name: 1 }, { unique: true });
repositorySchema.index({ organizationId: 1, fullName: 1 });

const repositorySyncStateSchema = new Schema({
  repositoryId: { type: Schema.Types.ObjectId, required: true, unique: true },
  status: { type: String, enum: ["queued", "running", "complete", "partial", "failed"], required: true },
  startedAt: { type: Date, default: null }, completedAt: { type: Date, default: null },
  lastError: { type: String, default: null },
  counts: { commits: { type: Number, default: 0 }, pullRequests: { type: Number, default: 0 }, issues: { type: Number, default: 0 }, branches: { type: Number, default: 0 }, deployments: { type: Number, default: 0 } },
  truncated: { type: Boolean, default: false }, correlationId: { type: String, default: null },
}, { timestamps: true, collection: "repository_sync_states" });

const githubCommitSchema = new Schema({
  githubId: String, repositoryId: { type: Number, required: true }, repositoryFullName: String, message: String,
  authorName: String, authorEmail: String, authorUsername: String, committedAt: Date, url: String,
  ref: String, added: [String], removed: [String], modified: [String], deliveryId: String, correlationId: String,
}, { timestamps: true });
const githubPullRequestSchema = new Schema({
  githubId: Number, repositoryId: { type: Number, required: true }, repositoryFullName: String, number: Number,
  title: String, body: String, state: String, merged: Boolean, draft: Boolean, authorUsername: String,
  baseBranch: String, headBranch: String, htmlUrl: String, createdAtGithub: Date, updatedAtGithub: Date,
  closedAtGithub: Date, mergedAtGithub: Date, action: String, deliveryId: String, correlationId: String,
}, { timestamps: true });
const githubIssueSchema = new Schema({
  githubId: Number, repositoryId: { type: Number, required: true }, repositoryFullName: String, number: Number,
  title: String, body: String, state: String, authorUsername: String, assignees: [String], labels: [String],
  htmlUrl: String, createdAtGithub: Date, updatedAtGithub: Date, closedAtGithub: Date,
  action: String, deliveryId: String, correlationId: String,
}, { timestamps: true });
const githubBranchSchema = new Schema({
  repositoryId: { type: Number, required: true }, repositoryFullName: String, name: String, sha: String,
  protected: Boolean, htmlUrl: String, correlationId: String,
}, { timestamps: true });
const githubDeploymentSchema = new Schema({
  repositoryId: { type: Number, required: true }, repositoryFullName: String, githubId: Number, sha: String,
  ref: String, task: String, environment: String, originalEnvironment: String, description: String,
  creatorUsername: String, state: String, environmentUrl: String, logUrl: String, createdAtGithub: Date,
  updatedAtGithub: Date, deliveryId: String, correlationId: String,
}, { timestamps: true });

/**
 * A personal access token: a long-lived bearer credential for programmatic
 * access (CLI, CI, integrations) alongside the browser's session cookie.
 *
 * This document stores **no usable credential**. `secretHash` is a SHA-256 of
 * the token's secret half, so a dump of this collection cannot be replayed.
 * Revocation is a field flip rather than a deletion, which keeps the document
 * (and therefore "this token existed and was revoked on X") available for
 * incident review. See lib/access-tokens.ts.
 */
const accessTokenSchema = new Schema(
  {
    // The public half of the token. Stored in the clear because it is a lookup
    // key, not a secret: it narrows a verification to exactly one document.
    id: { type: String, required: true, unique: true, index: true },
    // SHA-256 of the secret half. `select: false` so it cannot ride along on an
    // accidental query; verification opts back in with `.select("+secretHash")`.
    secretHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    userId: { type: String, required: true, index: true },
    scopes: {
      type: [String],
      enum: ACCESS_TOKEN_SCOPES,
      default: ["read"],
    },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    // Throttled: written at most once per LAST_USED_WRITE_INTERVAL_MS so a
    // busy token does not cause a write per request.
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
  },
  { timestamps: true },
);

// Listing a user's tokens, and the "revoke everything" sweep, are both by user.
accessTokenSchema.index({ userId: 1, createdAt: -1 });

export const accessTokenModel =
  mongoose.models.AccessToken ??
  mongoose.model("AccessToken", accessTokenSchema);

export const githubInstallationModel =
  mongoose.models.GithubInstallation ??
  mongoose.model("GithubInstallation", githubInstallationSchema);

export const repositoryModel =
  mongoose.models.Repository ??
  mongoose.model("Repository", repositorySchema);

export const repositorySyncStateModel = mongoose.models.RepositorySyncState ?? mongoose.model("RepositorySyncState", repositorySyncStateSchema);
export const githubCommitModel = mongoose.models.GithubCommit ?? mongoose.model("GithubCommit", githubCommitSchema);
export const githubPullRequestModel = mongoose.models.GithubPullRequest ?? mongoose.model("GithubPullRequest", githubPullRequestSchema);
export const githubIssueModel = mongoose.models.GithubIssue ?? mongoose.model("GithubIssue", githubIssueSchema);
export const githubBranchModel = mongoose.models.GithubBranch ?? mongoose.model("GithubBranch", githubBranchSchema);
export const githubDeploymentModel = mongoose.models.GithubDeployment ?? mongoose.model("GithubDeployment", githubDeploymentSchema);

export const organizationModel =
  mongoose.models.Organization ??
  mongoose.model("Organization", organizationSchema);

export const organizationMemberModel =
  mongoose.models.OrganizationMember ??
  mongoose.model("OrganizationMember", organizationMemberSchema);

export const organizationInvitationModel =
  mongoose.models.OrganizationInvitation ??
  mongoose.model("OrganizationInvitation", organizationInvitationSchema);

export const projectModel =
  mongoose.models.Project ?? mongoose.model("Project", projectSchema);

export const projectMemberModel =
  mongoose.models.ProjectMember ??
  mongoose.model("ProjectMember", projectMemberSchema);

export const projectActivityModel =
  mongoose.models.ProjectActivity ??
  mongoose.model("ProjectActivity", projectActivitySchema);

export const issueModel = mongoose.models.Issue ?? mongoose.model("Issue", issueSchema);
export const issueCommentModel = mongoose.models.IssueComment ?? mongoose.model("IssueComment", issueCommentSchema);
export const issueActivityModel = mongoose.models.IssueActivity ?? mongoose.model("IssueActivity", issueActivitySchema);

export const organizationActivityModel =
  mongoose.models.OrganizationActivity ??
  mongoose.model("OrganizationActivity", organizationActivitySchema);

export default projectModel;
