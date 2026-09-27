/**
 * Wire shapes shared by the web client and the API service. Dates cross the
 * wire as ISO strings; the web app is the only place that turns them into
 * `Date` objects for display.
 */

import type { ActivityAction, MemberRole, OrgRole } from "./roles.js";

export interface ProjectType {
  projectName: string;
  description: string;
  status: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  budget: number;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface OrgMemberRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  joinedAt: string;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  projectName: string;
  description: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: MemberRole;
}

export interface ProjectMemberRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
}

export interface ProjectActivityRecord {
  id: string;
  action: ActivityAction;
  actorId: string;
  actorName: string;
  changes: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RepositoryRecord {
  id: string;
  organizationId: string;
  installationId: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  defaultBranch: string | null;
  language: string | null;
  htmlUrl: string;
  lastSyncedAt: string | null;
  connectedAt: string;
  syncStatus: "queued" | "running" | "complete" | "partial" | "failed" | null;
  syncStartedAt: string | null;
  syncCompletedAt: string | null;
  syncError: string | null;
  syncTruncated: boolean;
  syncCounts: { commits: number; pullRequests: number; issues: number; branches: number; deployments: number } | null;
}

/** Error body every API route returns on failure. */
export interface ApiErrorBody {
  message: string;
  issues?: unknown;
}
