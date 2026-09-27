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

export function statusLabel(status: string) {
  return STATUS_LABELS[status as ProjectStatus] ?? status;
}

export function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

export function toDateInputValue(date: Date | undefined) {
  if (!date) {
    return "";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
