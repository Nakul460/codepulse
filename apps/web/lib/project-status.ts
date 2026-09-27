/**
 * Re-exported from `@codepulse/shared` so the API service and the web app
 * cannot disagree about roles, statuses or activity actions. The date coercion
 * helpers below are form-only and stay here.
 */

export {
  ACTIVITY_ACTIONS,
  ASSIGNABLE_ROLES,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  ORG_ACTIVITY_ACTIONS,
  ORG_ROLES,
  ORG_ROLE_LABELS,
  PROJECT_STATUSES,
  STATUS_LABELS,
  statusLabel,
} from "@codepulse/shared";

export type {
  ActivityAction,
  MemberRole,
  OrgActivityAction,
  OrgRole,
  ProjectStatus,
} from "@codepulse/shared";

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
