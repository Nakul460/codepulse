/**
 * Roles, statuses and activity actions — the single source of truth for every
 * enum in the product, shared by the web app and the API service so the two
 * cannot drift.
 */

export const PROJECT_STATUSES = [
  "ongoing",
  "completed",
  "upcoming",
  "on hold",
  "behind schedule",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  upcoming: "Upcoming",
  "on hold": "On hold",
  "behind schedule": "Behind schedule",
};

export const MEMBER_ROLES = ["owner", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export const ASSIGNABLE_ROLES = MEMBER_ROLES.filter(
  (role) => role !== "owner",
) as readonly Exclude<MemberRole, "owner">[];

export const ORG_ROLES = ["admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  member: "Member",
};

export const ACTIVITY_ACTIONS = [
  "project.created",
  "project.updated",
  "project.archived",
  "project.restored",
  "project.deleted",
  "member.added",
  "member.removed",
  "member.role_changed",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Organization-level audit actions. Not project-scoped, so a separate list. */
export const ORG_ACTIVITY_ACTIONS = [
  "org.created",
  "org.renamed",
  "org.deleted",
  "github.installed",
  "repo.disconnected",
  // Direct adds, kept for history: memberships created before the invitation
  // flow existed were written by `org.member_added` and must stay readable.
  "org.member_added",
  "org.member_removed",
  "org.member_role_changed",
  // The invitation lifecycle. An invite is the only way to add a member now,
  // so these are the events that matter after an account takeover: who was
  // offered access, who accepted, who refused.
  "org.invited",
  "org.invite_accepted",
  "org.invite_declined",
  "org.invite_revoked",
] as const;

export type OrgActivityAction = (typeof ORG_ACTIVITY_ACTIONS)[number];

export function statusLabel(status: string) {
  return STATUS_LABELS[status as ProjectStatus] ?? status;
}
