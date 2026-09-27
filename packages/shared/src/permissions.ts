import type { MemberRole, OrgRole } from "./roles.js";

/**
 * The permission model — the single source of truth for "may this role do X?".
 *
 * ## Why a matrix and not `role === "admin"` checks
 *
 * The original plan said to build "a centralized authorization layer rather
 * than scattering `if (user.role === 'admin')`". Before this file existed that
 * was only half true: `getOrgRole`/`assertOrgAdmin`/`resolveProjectRole`
 * centralized *lookup*, but the *decisions* were still inline boolean
 * expressions — `canEdit`, `canDelete`, `canManageMembers` in `lib/projects.ts`
 * and, worse, three copies of `project.role === "owner"` written directly in
 * the dashboard UI. Adding a role meant finding every one of them.
 *
 * Now a role is a row in a table, and a permission is a column. Adding a role
 * means adding a row; a role that is not listed in a matrix has **no**
 * permissions by construction rather than by omission.
 *
 * ## Why two matrices and not one
 *
 * The product has two genuinely different scopes with different vocabularies —
 * an organization has members, an org admin, and a GitHub App installation; a
 * project has an editor and an archive action. A single flat permission list
 * would need names like `org.manage_repositories` and `project.manage_members`
 * anyway, so the split only makes the type boundary honest: an org permission
 * can never be passed where a project permission is expected.
 *
 * These are two **types**, not one union, so mixing them up is a compile error
 * rather than a runtime surprise. That is the whole point of this file living
 * in `shared`: the web app and the API service evaluate the same table, so a
 * role cannot mean one thing in a route handler and another in a worker.
 */

/** What a person can do to and inside an organization they belong to. */
export const ORG_PERMISSIONS = [
  "view",
  "view_members",
  "update",
  "delete",
  "invite_members",
  "manage_members",
  "manage_roles",
  "manage_repositories",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/** What a person can do to and inside a single project. */
export const PROJECT_PERMISSIONS = [
  "view",
  "edit",
  "delete",
  "archive",
  "manage_members",
] as const;

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];

function granted<T extends string>(...permissions: T[]) {
  return new Set<T>(permissions);
}

/**
 * Organization permissions by role.
 *
 * `admin` and `member` are the only org roles (see `ORG_ROLES`). The matrix is
 * written out in full for **both**, including the empty set for `member`,
 * because an omitted row is indistinguishable from a forgotten one — spelling
 * out "a member can do nothing here" is the reviewable version.
 */
export const ORG_PERMISSION_MATRIX: Record<
  OrgRole,
  ReadonlySet<OrgPermission>
> = {
  admin: granted(
    "view",
    "view_members",
    "update",
    "delete",
    "invite_members",
    "manage_members",
    "manage_roles",
    "manage_repositories",
  ),
  // A member can see the org (via `view`) and nothing else.
  //
  // `view_members` is **admin-only by decision**, and that is the existing
  // behaviour, so it was kept rather than quietly widened: the member list is a
  // directory of everyone's work email address. It is a separate permission
  // rather than folded into `manage_members` so that decision is visible in one
  // place — granting members roster visibility later is a one-line change here,
  // and doing it accidentally while adding `manage_members` is not.
  member: granted("view"),
};

/** Project permissions by effective role. */
export const PROJECT_PERMISSION_MATRIX: Record<
  MemberRole,
  ReadonlySet<ProjectPermission>
> = {
  owner: granted(
    "view",
    "edit",
    "delete",
    "archive",
    "manage_members",
  ),
  editor: granted("view", "edit", "archive"),
  viewer: granted("view"),
};

/**
 * Can this org role do this thing? A `null` role (not a member) has nothing.
 *
 * Unknown roles resolve to **false** rather than throwing: this is on the
 * authorization path, and a role value that reached here from an unexpected
 * source should deny, not 500.
 */
export function orgCan(
  role: OrgRole | null | undefined,
  permission: OrgPermission,
): boolean {
  if (!role) return false;
  return ORG_PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

/** Can this effective project role do this thing? `null` (no access) is false. */
export function projectCan(
  role: MemberRole | null | undefined,
  permission: ProjectPermission,
): boolean {
  if (!role) return false;
  return PROJECT_PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

/** Every permission a role has, for rendering capability-aware UI. */
export function orgPermissionsFor(
  role: OrgRole | null | undefined,
): OrgPermission[] {
  if (!role) return [];
  return [...(ORG_PERMISSION_MATRIX[role] ?? [])];
}

export function projectPermissionsFor(
  role: MemberRole | null | undefined,
): ProjectPermission[] {
  if (!role) return [];
  return [...(PROJECT_PERMISSION_MATRIX[role] ?? [])];
}

/**
 * A compile-time guarantee that no role is missing permissions.
 *
 * `Record<OrgRole, …>` and `Record<MemberRole, …>` are exhaustive, so adding a
 * role to `ORG_ROLES`/`MEMBER_ROLES` in `roles.ts` without deciding what it may
 * do here is a **typecheck error**, not a role that silently gets nothing. That
 * is the point: the failure has to be impossible to miss.
 */
type OrgRolesCovered = Exclude<OrgRole, keyof typeof ORG_PERMISSION_MATRIX>;
type ProjectRolesCovered = Exclude<MemberRole, keyof typeof PROJECT_PERMISSION_MATRIX>;

/** Compile-error placeholders: non-empty if a role is ever left uncovered. */
type AssertNever<T extends never> = T;
export type _OrgRolesAllCovered = AssertNever<OrgRolesCovered>;
export type _ProjectRolesAllCovered = AssertNever<ProjectRolesCovered>;
