import type {
  AccessTokenRecord,
  CreatedAccessToken,
  OrganizationRecord,
  OrgMemberRecord,
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectType,
  OrgRole,
  RepositoryRecord,
} from "@/types/project-type";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type IssueStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface IssueRecord {
  id: string; projectId: string; organizationId: string; title: string; description: string;
  status: IssueStatus; priority: IssuePriority; labels: string[]; assigneeId: string | null;
  dueDate: string | null; estimate: number | null; parentIssueId: string | null; relatedIssueIds: string[];
  attachments: { name: string; url: string; mimeType: string; size: number; addedAt: string | null }[];
  archivedAt: string | null; createdBy: string; updatedBy: string; createdAt: string | null; updatedAt: string | null;
}
export interface IssueCommentRecord { id: string; authorId: string; authorName: string; body: string; mentions: string[]; createdAt: string }
export interface IssueActivityRecord { id: string; actorName: string; action: string; changes: string[]; metadata: Record<string, unknown> | null; createdAt: string }

export function listIssues(projectId: string, options: { archived?: boolean } = {}, signal?: AbortSignal) {
  const query = options.archived ? "?archived=true" : "";
  return request<{ issues: IssueRecord[] }>(`/api/projects/${encodeURIComponent(projectId)}/issues${query}`, { signal });
}

export function createIssue(projectId: string, values: Partial<IssueRecord> & { title: string }) {
  return request<{ issue: IssueRecord }>(`/api/projects/${encodeURIComponent(projectId)}/issues`, { method: "POST", body: JSON.stringify(values) });
}

export function getIssue(issueId: string, signal?: AbortSignal) {
  return request<{ issue: IssueRecord; role: "owner" | "editor" | "viewer"; comments: IssueCommentRecord[]; activity: IssueActivityRecord[] }>(`/api/issues/${encodeURIComponent(issueId)}`, { signal });
}

export function updateIssue(issueId: string, values: Partial<IssueRecord>) {
  return request<{ issue: IssueRecord }>(`/api/issues/${encodeURIComponent(issueId)}`, { method: "PATCH", body: JSON.stringify(values) });
}

export function archiveIssue(issueId: string) {
  return request<{ ok: true; archivedAt: string | null }>(`/api/issues/${encodeURIComponent(issueId)}`, { method: "DELETE" });
}

export function createIssueComment(issueId: string, body: string, mentions: string[] = []) {
  return request<{ comment: IssueCommentRecord }>(`/api/issues/${encodeURIComponent(issueId)}/comments`, { method: "POST", body: JSON.stringify({ body, mentions }) });
}

async function request<T>(
  url: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(data.message ?? "Request failed", res.status);
  }

  return data as T;
}

export function listProjects(
  options: { archived?: boolean; organizationId?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (options.archived) {
    params.set("archived", "true");
  }
  if (options.organizationId) {
    params.set("orgId", options.organizationId);
  }

  const query = params.toString();
  return request<{ projects: ProjectRecord[] }>(
    `/api/projects${query ? `?${query}` : ""}`,
    { signal },
  );
}

export function createProject(values: ProjectType & { organizationId: string }) {
  return request<{ project: ProjectRecord }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export function listOrganizations(signal?: AbortSignal) {
  return request<{ organizations: OrganizationRecord[] }>("/api/organizations", {
    signal,
  });
}

export function createOrganization(name: string) {
  return request<{ organization: OrganizationRecord }>("/api/organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateOrganization(orgId: string, name: string) {
  return request<{ organization: OrganizationRecord }>(
    `/api/organizations/${orgId}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export function deleteOrganization(orgId: string) {
  return request<{ message: string }>(`/api/organizations/${orgId}`, {
    method: "DELETE",
  });
}

export function listOrgMembers(orgId: string, signal?: AbortSignal) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members`,
    { signal },
  );
}

// New members are always created as "member". Promotion is a separate,
// explicit call so granting admin rights can never ride along with an add.
export interface OrgInvitationRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: OrgRole;
  status: string;
  invitedByName: string;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
  respondedAt: string | null;
}

export function listOrgInvitations(orgId: string, signal?: AbortSignal) {
  return request<{ invitations: OrgInvitationRecord[] }>(
    `/api/organizations/${orgId}/invitations`,
    { signal },
  );
}

/**
 * Invites someone to the organization.
 *
 * There is deliberately no `addOrgMember` helper any more. Members are added by
 * invitation, so the membership does not exist until the recipient accepts a
 * token that was emailed to the address — which is what stops an admin from
 * granting access to an address that belongs to someone else.
 */
export function inviteOrgMember(orgId: string, email: string) {
  return request<{ invitation: OrgInvitationRecord }>(
    `/api/organizations/${orgId}/invitations`,
    { method: "POST", body: JSON.stringify({ email, role: "member" }) },
  );
}

export function revokeOrgInvitation(orgId: string, invitationId: string) {
  return request<{ ok: true }>(
    `/api/organizations/${orgId}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

/** Invitations addressed to the signed-in user, for the dashboard banner. */
export function listMyInvitations(signal?: AbortSignal) {
  return request<{ invitations: OrgInvitationRecord[] }>("/api/invitations", {
    signal,
  });
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: OrgRole;
  invitedByName: string;
  expiresAt: string;
  status: string;
}

export function previewInvitation(token: string, signal?: AbortSignal) {
  return request<{ invitation: InvitationPreview }>(
    `/api/invitations/${encodeURIComponent(token)}`,
    { signal },
  );
}

/**
 * Accepts an invitation addressed to the signed-in user.
 *
 * `tokenOrId` is the token from the emailed link (landing page) or the id from
 * the caller's own pending list (dashboard banner). The server stores only the
 * token's hash, so the banner has nothing to deep-link with and resolves the
 * invitation from the signed-in user's own list instead — the session for a
 * verified address is the same proof the emailed token provides.
 */
export function acceptInvitation(tokenOrId: string) {
  return request<{ ok: true; organizationId: string; organizationName: string }>(
    `/api/invitations/${encodeURIComponent(tokenOrId)}/accept`,
    { method: "POST" },
  );
}

/** Declines an invitation; `tokenOrId` is as for `acceptInvitation`. */
export function declineInvitation(tokenOrId: string) {
  return request<{ ok: true }>(
    `/api/invitations/${encodeURIComponent(tokenOrId)}/decline`,
    { method: "POST" },
  );
}


export function updateOrgMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members/${userId}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeOrgMember(orgId: string, userId: string) {
  return request<{ members: OrgMemberRecord[] }>(
    `/api/organizations/${orgId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function updateProject(projectId: string, values: Partial<ProjectType>) {
  return request<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export function getProject(projectId: string, signal?: AbortSignal) {
  return request<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    signal,
  });
}

export function deleteProject(projectId: string) {
  return request<{ message: string }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export function archiveProject(projectId: string) {
  return request<{ project: ProjectRecord }>(
    `/api/projects/${projectId}/archive`,
    { method: "POST" },
  );
}

export function restoreProject(projectId: string) {
  return request<{ project: ProjectRecord }>(
    `/api/projects/${projectId}/archive`,
    { method: "DELETE" },
  );
}

export function listMembers(projectId: string, signal?: AbortSignal) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members`,
    { signal },
  );
}

export function addMember(
  projectId: string,
  email: string,
  role: "editor" | "viewer",
) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members`,
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
}

export function updateMemberRole(
  projectId: string,
  userId: string,
  role: "editor" | "viewer",
) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members/${userId}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeMember(projectId: string, userId: string) {
  return request<{ members: ProjectMemberRecord[] }>(
    `/api/projects/${projectId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function listActivity(projectId: string, signal?: AbortSignal) {
  return request<{ activity: ProjectActivityRecord[] }>(
    `/api/projects/${projectId}/activity`,
    { signal },
  );
}

export function listRepositories(
  options: { organizationId?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (options.organizationId) {
    params.set("orgId", options.organizationId);
  }

  const query = params.toString();
  return request<{ repositories: RepositoryRecord[] }>(
    `/api/repositories${query ? `?${query}` : ""}`,
    { signal },
  );
}

/**
 * Where to send an org admin to install the GitHub App.
 *
 * This is a full-page navigation, not a fetch: the endpoint 302s to GitHub and
 * GitHub 302s back to the install callback. The returned URL is built here
 * only so callers can link to it directly.
 */
export function repositoryInstallUrl(organizationId: string) {
  return `/api/repositories/install?orgId=${encodeURIComponent(organizationId)}`;
}

export function disconnectRepository(repositoryId: string) {
  return request<{ message: string }>(`/api/repositories/${repositoryId}`, {
    method: "DELETE",
  });
}

export interface GithubWebhookStatus {
  appConfigured: boolean;
  configured: boolean;
  callbackUrl: string;
  currentUrl?: string | null;
  appUrl: string | null;
  missingEvents: string[];
  missingPermissions: string[];
}

export function getGithubWebhookStatus(orgId: string, signal?: AbortSignal) {
  return request<{ webhook: GithubWebhookStatus }>(`/api/repositories/webhook?orgId=${encodeURIComponent(orgId)}`, { signal });
}

export function configureGithubWebhook(orgId: string) {
  return request<{ webhook: GithubWebhookStatus }>(`/api/repositories/webhook?orgId=${encodeURIComponent(orgId)}`, { method: "POST" });
}

export function triggerRepositorySync(repositoryId: string) {
  return request<{ queued: boolean; correlationId: string; jobId: string }>(`/api/repositories/${encodeURIComponent(repositoryId)}/sync`, { method: "POST" });
}

export interface RepositoryData {
  repository: RepositoryRecord;
  branches: { id: string; name: string; sha: string; protected: boolean; htmlUrl: string }[];
  commits: { id: string; githubId: string; message: string; authorName: string; authorUsername: string; committedAt: string | null; url: string; ref: string }[];
  pullRequests: { id: string; number: number; title: string; state: string; merged: boolean; draft: boolean; authorUsername: string; baseBranch: string; headBranch: string; htmlUrl: string; updatedAtGithub: string | null }[];
  issues: { id: string; number: number; title: string; state: string; authorUsername: string; assignees: string[]; labels: string[]; htmlUrl: string; updatedAtGithub: string | null }[];
  deployments: { id: string; githubId: number; ref: string; sha: string; task: string; environment: string; description: string; creatorUsername: string; state: string; environmentUrl: string; logUrl: string; createdAtGithub: string | null; updatedAtGithub: string | null }[];
}

export function getRepositoryData(repositoryId: string, signal?: AbortSignal) {
  return request<RepositoryData>(`/api/repositories/${encodeURIComponent(repositoryId)}/data`, { signal });
}

/* Access tokens ---------------------------------------------------------- */

export function listAccessTokens(signal?: AbortSignal) {
  return request<{ tokens: AccessTokenRecord[] }>("/api/tokens", { signal });
}

/**
 * Creates a token. The returned `secret` is the only time its value is ever
 * available, so the caller must show it to the user immediately rather than
 * storing it in component state that might be re-fetched away.
 */
export function createAccessToken(input: {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}) {
  return request<CreatedAccessToken>("/api/tokens", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeAccessToken(tokenId: string) {
  return request<{ ok: true }>(`/api/tokens/${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Account: identity, credentials and sessions.
//
// Every helper here targets the signed-in user's own account and is
// session-only (the routes call `requireSessionUser`, not `requireUser`), so
// none of them accept a bearer token. That is deliberate: reading which
// providers someone has connected, listing their logged-in devices, or
// deleting the account are identity operations, not API data, and a personal
// access token should not be able to do any of them.
// ---------------------------------------------------------------------------

export interface AccountSummary {
  email: string;
  emailVerified: boolean;
  /** False when this deployment has no mail sender configured. */
  canVerifyEmail: boolean;
  name: string;
  image: string | null;
  lastLoginMethod: string | null;
  hasPassword: boolean;
}

export interface LinkedAccount {
  providerId: string;
  canUnlink: boolean;
  linkedAt: string | null;
}

export interface DeviceSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
  isNewDevice: boolean;
  deviceLabel: string;
}

export interface AccountDeletionBlocker {
  organizationId: string;
  organizationName: string;
  memberCount: number;
}

export function getAccount(signal?: AbortSignal) {
  return request<{ account: AccountSummary; connections: LinkedAccount[] }>(
    "/api/account",
    { signal },
  );
}

export function resendVerificationEmail() {
  return request<{ ok: true }>("/api/account/verification", { method: "POST" });
}

export function changePassword(input: {
  /** Omitted for an OAuth-only account setting its first password. */
  currentPassword?: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}) {
  return request<{ ok: true }>("/api/account/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDeviceSessions(signal?: AbortSignal) {
  return request<{ sessions: DeviceSession[] }>("/api/account/sessions", {
    signal,
  });
}

export function revokeDeviceSession(sessionId: string) {
  return request<{ ok: true }>(
    `/api/account/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export function revokeOtherSessions() {
  return request<{ ok: true }>("/api/account/sessions", { method: "POST" });
}

export function unlinkProvider(providerId: string) {
  return request<{ ok: true }>(
    `/api/account/connections/${encodeURIComponent(providerId)}`,
    { method: "DELETE" },
  );
}

export function getAccountDeletionBlockers(signal?: AbortSignal) {
  return request<{ blockers: AccountDeletionBlocker[] }>("/api/account/deletion", {
    signal,
  });
}

export function deleteAccount(password?: string) {
  return request<{ ok: true }>("/api/account/deletion", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
